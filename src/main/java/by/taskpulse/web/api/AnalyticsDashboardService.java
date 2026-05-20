package by.taskpulse.web.api;

import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AnalyticsDashboardService {

    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("dd.MM",
            Locale.forLanguageTag("ru"));
    private static final DateTimeFormatter WEEK_LABEL = DateTimeFormatter.ofPattern("dd.MM",
            Locale.forLanguageTag("ru"));
    private static final DateTimeFormatter WORKDAY_LABEL = DateTimeFormatter.ofPattern("EE dd.MM",
            Locale.forLanguageTag("ru"));

    private final JdbcTemplate jdbcTemplate;

    public AnalyticsDashboardService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, Object> build(Long teamId, List<Long> projectIds, int periodDays) {
        int days = Math.min(365, Math.max(7, periodDays));
        String inProjects = inClause(projectIds);
        if (inProjects.isEmpty()) {
            return emptyDashboard(days);
        }

        String teamName = jdbcTemplate.query(
                "select coalesce(name, 'Команда') from app_team where id = ?",
                rs -> rs.next() ? rs.getString(1) : "Команда",
                teamId);

        Map<String, Object> kpis = loadKpis(inProjects, days);
        List<Map<String, Object>> stages = loadDistribution(inProjects, "stage", days);
        List<Map<String, Object>> priorities = loadDistribution(inProjects, "priority", days);
        int velocityWeeks = velocityChartWeeks(days);
        int cfdWeeks = chartWeeks(days);
        Map<String, Object> velocity;
        Map<String, Object> cumulativeFlow;
        String chartGranularity;
        if (useDailyWorkdayCharts(days)) {
            chartGranularity = "workday";
            velocity = loadVelocityByWorkdays(inProjects, days);
            cumulativeFlow = loadCumulativeFlowByWorkdays(inProjects, days);
        } else {
            chartGranularity = "week";
            velocity = loadVelocity(inProjects, days, velocityWeeks);
            cumulativeFlow = loadCumulativeFlow(inProjects, days, cfdWeeks);
        }
        Map<String, Object> activity;
        String activityGranularity;
        if (useDailyWorkdayCharts(days)) {
            activityGranularity = "workday";
            activity = loadActivityByWorkdays(inProjects, days);
        } else if (activityBucketWeeks(days) > 0) {
            activityGranularity = "week";
            activity = loadWeeklyActivity(inProjects, days, activityBucketWeeks(days));
        } else {
            activityGranularity = "day";
            activity = loadDailyActivity(inProjects, days);
        }
        List<Map<String, Object>> assignees = loadAssignees(teamId, inProjects);
        List<Map<String, Object>> projects = loadProjectRows(inProjects);
        List<Map<String, Object>> risks = loadRisks(projects);
        Map<String, Object> leadTime = loadLeadTime(inProjects, days);
        List<Map<String, Object>> transitions = loadTopTransitions(inProjects, days);
        Map<String, Object> workload = loadWorkloadBalance(assignees);

        int total = intVal(kpis.get("total"));
        int donePeriod = intVal(kpis.get("donePeriod"));
        int overdue = intVal(kpis.get("overdue"));
        int overdueRate = percent(overdue, Math.max(total, 1));
        int doneRate = percent(donePeriod, Math.max(total, 1));
        String health = overdueRate >= 25 ? "high_risk" : overdueRate >= 10 ? "attention" : "stable";

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("teamName", teamName);
        meta.put("periodDays", days);
        meta.put("generatedAt", LocalDate.now().toString());
        meta.put("projectCount", projects.size());
        meta.put("taskCount", total);
        meta.put("chartGranularity", chartGranularity);
        meta.put("activityGranularity", activityGranularity);
        meta.put("distributionTaskCount", total);
        meta.put("periodScoped", true);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("meta", meta);
        out.put("kpis", kpis);
        out.put("executive", Map.of(
                "doneRate", doneRate,
                "overdueRate", overdueRate,
                "health", health,
                "healthLabel", healthLabel(health)));
        out.put("stageDistribution", stages);
        out.put("priorityDistribution", priorities);
        out.put("velocity", velocity);
        out.put("cumulativeFlow", cumulativeFlow);
        out.put("activity", activity);
        out.put("byAssignee", assignees);
        out.put("byProject", projects);
        out.put("topRisks", risks);
        out.put("leadTime", leadTime);
        out.put("transitions", transitions);
        out.put("workload", workload);
        out.put("reports", buildReportsSummary(projects, kpis, doneRate, overdueRate, health));
        return out;
    }

    private Map<String, Object> emptyDashboard(int days) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("meta", Map.of("teamName", "Команда", "periodDays", days, "generatedAt", LocalDate.now().toString(),
                "projectCount", 0, "taskCount", 0));
        out.put("kpis", Map.of("total", 0, "done", 0, "inProgress", 0, "queue", 0, "overdue", 0, "urgent", 0,
                "createdPeriod", 0, "donePeriod", 0, "testing", 0));
        out.put("executive", Map.of("doneRate", 0, "overdueRate", 0, "health", "stable", "healthLabel", "Нет данных"));
        out.put("stageDistribution", List.of());
        out.put("priorityDistribution", List.of());
        out.put("velocity", Map.of("labels", List.of(), "created", List.of(), "completed", List.of()));
        out.put("cumulativeFlow", Map.of("labels", List.of(), "queue", List.of(), "inProgress", List.of(), "testing",
                List.of(), "done", List.of()));
        out.put("activity", Map.of("labels", List.of(), "changes", List.of()));
        out.put("byAssignee", List.of());
        out.put("byProject", List.of());
        out.put("topRisks", List.of());
        out.put("leadTime", Map.of("avgDays", 0, "medianDays", 0, "sampleSize", 0));
        out.put("transitions", List.of());
        out.put("workload", Map.of("balanced", true, "message", "Недостаточно данных"));
        out.put("reports", Map.of("summary", Map.of(), "rows", List.of()));
        return out;
    }

    private Map<String, Object> loadKpis(String inProjects, int days) {
        Timestamp asOf = Timestamp.valueOf(LocalDate.now().atTime(23, 59, 59));
        Map<String, Object> row = jdbcTemplate.queryForMap(
                """
                        select
                            count(*) as total,
                            count(case when stage_as_of = 'Готово' then 1 end) as done,
                            count(case when stage_as_of in ('В работе', 'Тестирование') then 1 end) as in_progress,
                            count(case when stage_as_of not in ('В работе', 'Тестирование', 'Готово') then 1 end) as queue,
                            count(case when stage_as_of = 'Тестирование' then 1 end) as testing,
                            count(case when due_date is not null and due_date < current_date
                                and stage_as_of <> 'Готово' then 1 end) as overdue,
                            count(case when priority = 'срочно' and stage_as_of <> 'Готово' then 1 end) as urgent,
                            count(case when created_at::date >= current_date - ? then 1 end) as created_period
                        from (
                            select
                                t.created_at,
                                t.due_date,
                                coalesce(t.priority, 'обычный') as priority,
                                coalesce(
                                    nullif(
                                        trim((
                                            select h.new_stage
                                            from task_status_history h
                                            where h.task_id = t.id
                                              and h.changed_at <= ?
                                            order by h.changed_at desc, h.id desc
                                            limit 1
                                        )),
                                        ''
                                    ),
                                    'Очередь'
                                ) as stage_as_of
                            from task_item t
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and (
                                t.created_at::date >= current_date - ?
                                or exists (
                                    select 1 from task_status_history h2
                                    where h2.task_id = t.id and h2.changed_at::date >= current_date - ?
                                )
                              )
                        ) snap
                        """.formatted(inProjects),
                days,
                asOf,
                days,
                days);
        Integer donePeriod = jdbcTemplate.queryForObject(
                """
                        select count(distinct h.task_id)
                        from task_status_history h
                        join task_item t on t.id = h.task_id
                        join board b on b.id = t.board_id
                        where b.project_id in (%s)
                          and h.new_stage = 'Готово'
                          and h.changed_at::date >= current_date - ?
                        """.formatted(inProjects),
                Integer.class,
                days);

        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("total", intVal(row.get("total")));
        kpis.put("done", intVal(row.get("done")));
        kpis.put("inProgress", intVal(row.get("in_progress")));
        kpis.put("queue", intVal(row.get("queue")));
        kpis.put("testing", intVal(row.get("testing")));
        kpis.put("overdue", intVal(row.get("overdue")));
        kpis.put("urgent", intVal(row.get("urgent")));
        kpis.put("createdPeriod", intVal(row.get("created_period")));
        kpis.put("donePeriod", donePeriod == null ? 0 : donePeriod);
        return kpis;
    }

    private List<Map<String, Object>> loadDistribution(String inProjects, String field, int periodDays) {
        Timestamp asOf = Timestamp.valueOf(LocalDate.now().atTime(23, 59, 59));
        if ("priority".equals(field)) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    """
                            select coalesce(t.priority, 'обычный') as label, count(*) as cnt
                            from task_item t
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and (
                                t.created_at::date >= current_date - ?
                                or exists (
                                    select 1 from task_status_history h
                                    where h.task_id = t.id and h.changed_at::date >= current_date - ?
                                )
                              )
                            group by 1
                            order by cnt desc
                            """.formatted(inProjects),
                    periodDays,
                    periodDays);
            return mapDistributionRows(rows);
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        select label, count(*) as cnt
                        from (
                            select
                                coalesce(
                                    nullif(
                                        trim((
                                            select h.new_stage
                                            from task_status_history h
                                            where h.task_id = t.id
                                              and h.changed_at <= ?
                                            order by h.changed_at desc, h.id desc
                                            limit 1
                                        )),
                                        ''
                                    ),
                                    'Очередь'
                                ) as label
                            from task_item t
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and (
                                t.created_at::date >= current_date - ?
                                or exists (
                                    select 1 from task_status_history h2
                                    where h2.task_id = t.id and h2.changed_at::date >= current_date - ?
                                )
                              )
                        ) snap
                        group by 1
                        order by cnt desc
                        """.formatted(inProjects),
                asOf,
                periodDays,
                periodDays);
        return mapDistributionRows(rows);
    }

    private List<Map<String, Object>> mapDistributionRows(List<Map<String, Object>> rows) {
        int total = rows.stream().mapToInt(r -> intVal(r.get("cnt"))).sum();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            int cnt = intVal(r.get("cnt"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", String.valueOf(r.get("label")));
            item.put("count", cnt);
            item.put("percent", percent(cnt, Math.max(total, 1)));
            out.add(item);
        }
        return out;
    }

    private Map<String, Object> loadVelocityByWorkdays(String inProjects, int periodDays) {
        List<String> labels = new ArrayList<>();
        List<Integer> created = new ArrayList<>();
        List<Integer> completed = new ArrayList<>();
        for (LocalDate day : workdaysInPeriod(periodDays)) {
            labels.add(WORKDAY_LABEL.format(day));
            Integer c = jdbcTemplate.queryForObject(
                    """
                            select count(*) from task_item t
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and t.created_at::date = ?::date
                            """.formatted(inProjects),
                    Integer.class,
                    day.toString());
            Integer d = jdbcTemplate.queryForObject(
                    """
                            select count(distinct h.task_id) from task_status_history h
                            join task_item t on t.id = h.task_id
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and h.new_stage = 'Готово'
                              and h.changed_at::date = ?::date
                            """.formatted(inProjects),
                    Integer.class,
                    day.toString());
            created.add(c == null ? 0 : c);
            completed.add(d == null ? 0 : d);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("created", created);
        out.put("completed", completed);
        return out;
    }

    private Map<String, Object> loadCumulativeFlowByWorkdays(String inProjects, int periodDays) {
        List<String> labels = new ArrayList<>();
        List<Integer> queue = new ArrayList<>();
        List<Integer> inProgress = new ArrayList<>();
        List<Integer> testing = new ArrayList<>();
        List<Integer> done = new ArrayList<>();
        for (LocalDate day : workdaysInPeriod(periodDays)) {
            Timestamp asOf = Timestamp.valueOf(day.atTime(23, 59, 59));
            labels.add(WORKDAY_LABEL.format(day));
            Map<String, Object> snap = queryCfdSnapshot(inProjects, asOf);
            queue.add(intVal(snap.get("queue_cnt")));
            inProgress.add(intVal(snap.get("wip_cnt")));
            testing.add(intVal(snap.get("test_cnt")));
            done.add(intVal(snap.get("done_cnt")));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("queue", queue);
        out.put("inProgress", inProgress);
        out.put("testing", testing);
        out.put("done", done);
        return out;
    }

    private Map<String, Object> queryCfdSnapshot(String inProjects, Timestamp asOf) {
        return jdbcTemplate.queryForMap(
                """
                        select
                            count(*) filter (where stage_as_of not in ('В работе', 'Тестирование', 'Готово')) as queue_cnt,
                            count(*) filter (where stage_as_of = 'В работе') as wip_cnt,
                            count(*) filter (where stage_as_of = 'Тестирование') as test_cnt,
                            count(*) filter (where stage_as_of = 'Готово') as done_cnt
                        from (
                            select
                                coalesce(
                                    nullif(
                                        trim(
                                            (
                                                select h.new_stage
                                                from task_status_history h
                                                where h.task_id = t.id
                                                  and h.changed_at <= ?
                                                order by h.changed_at desc, h.id desc
                                                limit 1
                                            )
                                        ),
                                        ''
                                    ),
                                    'Очередь'
                                ) as stage_as_of
                            from task_item t
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and t.created_at <= ?
                        ) snap
                        """
                        .formatted(inProjects),
                asOf,
                asOf);
    }

    private Map<String, Object> loadVelocity(String inProjects, int periodDays, int weeks) {
        LocalDate periodStart = LocalDate.now().minusDays(Math.max(0, periodDays - 1));
        List<String> labels = new ArrayList<>();
        List<Integer> created = new ArrayList<>();
        List<Integer> completed = new ArrayList<>();
        for (int w = weeks - 1; w >= 0; w--) {
            LocalDate weekStart = LocalDate.now().minusWeeks(w).with(java.time.DayOfWeek.MONDAY);
            LocalDate weekEnd = weekStart.plusDays(6);
            if (weekEnd.isBefore(periodStart)) {
                continue;
            }
            LocalDate countFrom = weekStart.isBefore(periodStart) ? periodStart : weekStart;
            labels.add(WEEK_LABEL.format(weekStart));
            Integer c = jdbcTemplate.queryForObject(
                    """
                            select count(*) from task_item t
                            join board b on b.id = t.board_id
                            where t.archived_at is null and b.project_id in (%s)
                              and t.created_at::date >= ?::date
                              and t.created_at::date <= ?::date
                            """.formatted(inProjects),
                    Integer.class,
                    countFrom.toString(),
                    weekEnd.toString());
            Integer d = jdbcTemplate.queryForObject(
                    """
                            select count(distinct h.task_id) from task_status_history h
                            join task_item t on t.id = h.task_id
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and h.new_stage = 'Готово'
                              and h.changed_at::date >= ?::date
                              and h.changed_at::date <= ?::date
                            """.formatted(inProjects),
                    Integer.class,
                    countFrom.toString(),
                    weekEnd.toString());
            created.add(c == null ? 0 : c);
            completed.add(d == null ? 0 : d);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("created", created);
        out.put("completed", completed);
        return out;
    }

    private Map<String, Object> loadCumulativeFlow(String inProjects, int periodDays, int weeks) {
        LocalDate periodStart = LocalDate.now().minusDays(Math.max(0, periodDays - 1));
        List<String> labels = new ArrayList<>();
        List<Integer> queue = new ArrayList<>();
        List<Integer> inProgress = new ArrayList<>();
        List<Integer> testing = new ArrayList<>();
        List<Integer> done = new ArrayList<>();
        for (int w = weeks - 1; w >= 0; w--) {
            LocalDate weekEnd = LocalDate.now().minusWeeks(w).with(java.time.DayOfWeek.SUNDAY);
            if (weekEnd.isBefore(periodStart)) {
                continue;
            }
            Timestamp asOf = Timestamp.valueOf(weekEnd.atTime(23, 59, 59));
            labels.add(WEEK_LABEL.format(weekEnd));
            Map<String, Object> snap = queryCfdSnapshot(inProjects, asOf);
            queue.add(intVal(snap.get("queue_cnt")));
            inProgress.add(intVal(snap.get("wip_cnt")));
            testing.add(intVal(snap.get("test_cnt")));
            done.add(intVal(snap.get("done_cnt")));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("queue", queue);
        out.put("inProgress", inProgress);
        out.put("testing", testing);
        out.put("done", done);
        return out;
    }

    private Map<String, Object> loadActivityByWorkdays(String inProjects, int periodDays) {
        List<String> labels = new ArrayList<>();
        List<Integer> changes = new ArrayList<>();
        for (LocalDate day : workdaysInPeriod(periodDays)) {
            labels.add(WORKDAY_LABEL.format(day));
            Integer cnt = jdbcTemplate.queryForObject(
                    """
                            select count(*) from task_status_history h
                            join task_item t on t.id = h.task_id
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and h.changed_at::date = ?::date
                              and (h.old_stage is null or h.old_stage <> h.new_stage)
                            """.formatted(inProjects),
                    Integer.class,
                    day.toString());
            changes.add(cnt == null ? 0 : cnt);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("changes", changes);
        return out;
    }

    private Map<String, Object> loadWeeklyActivity(String inProjects, int periodDays, int weeks) {
        LocalDate periodStart = LocalDate.now().minusDays(Math.max(0, periodDays - 1));
        List<String> labels = new ArrayList<>();
        List<Integer> changes = new ArrayList<>();
        for (int w = weeks - 1; w >= 0; w--) {
            LocalDate weekStart = LocalDate.now().minusWeeks(w).with(DayOfWeek.MONDAY);
            LocalDate weekEnd = weekStart.plusDays(6);
            if (weekEnd.isBefore(periodStart)) {
                continue;
            }
            LocalDate countFrom = weekStart.isBefore(periodStart) ? periodStart : weekStart;
            labels.add(WEEK_LABEL.format(weekStart));
            Integer cnt = jdbcTemplate.queryForObject(
                    """
                            select count(*) from task_status_history h
                            join task_item t on t.id = h.task_id
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and h.changed_at::date >= ?::date
                              and h.changed_at::date <= ?::date
                              and (h.old_stage is null or h.old_stage <> h.new_stage)
                            """.formatted(inProjects),
                    Integer.class,
                    countFrom.toString(),
                    weekEnd.toString());
            changes.add(cnt == null ? 0 : cnt);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("changes", changes);
        return out;
    }

    private Map<String, Object> loadDailyActivity(String inProjects, int days) {
        List<String> labels = new ArrayList<>();
        List<Integer> changes = new ArrayList<>();
        for (int i = days - 1; i >= 0; i--) {
            LocalDate day = LocalDate.now().minusDays(i);
            labels.add(DAY_LABEL.format(day));
            Integer cnt = jdbcTemplate.queryForObject(
                    """
                            select count(*) from task_status_history h
                            join task_item t on t.id = h.task_id
                            join board b on b.id = t.board_id
                            where b.project_id in (%s)
                              and h.changed_at::date = ?::date
                              and (h.old_stage is null or h.old_stage <> h.new_stage)
                            """.formatted(inProjects),
                    Integer.class,
                    day.toString());
            changes.add(cnt == null ? 0 : cnt);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("labels", labels);
        out.put("changes", changes);
        return out;
    }

    private List<Map<String, Object>> loadAssignees(Long teamId, String inProjects) {
        return jdbcTemplate.query(
                """
                        select
                            u.id,
                            coalesce(
                                nullif(trim(concat_ws(' ', nullif(trim(u.last_name), ''), nullif(trim(u.first_name), ''))), ''),
                                nullif(trim(u.full_name), ''),
                                u.email,
                                'Без имени'
                            ) as name,
                            count(t.id) filter (where t.archived_at is null and b.id is not null) as assigned,
                            count(t.id) filter (where t.stage = 'Готово' and b.id is not null) as done,
                            count(t.id) filter (where t.archived_at is null and t.stage in ('В работе', 'Тестирование') and b.id is not null) as in_progress,
                            count(t.id) filter (where t.archived_at is null and t.due_date is not null and t.due_date < current_date
                                and coalesce(t.stage, 'Очередь') <> 'Готово' and b.id is not null) as overdue
                        from app_user u
                        join team_membership tm on tm.user_id = u.id and tm.team_id = ?
                        left join task_item t on t.assignee_id = u.id
                        left join board b on b.id = t.board_id and b.project_id in (%s)
                        group by u.id, u.last_name, u.first_name, u.full_name, u.email
                        order by assigned desc, name
                        """.formatted(inProjects),
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", rs.getString("name"));
                    row.put("assigned", rs.getInt("assigned"));
                    row.put("done", rs.getInt("done"));
                    row.put("inProgress", rs.getInt("in_progress"));
                    row.put("overdue", rs.getInt("overdue"));
                    int assigned = rs.getInt("assigned");
                    int done = rs.getInt("done");
                    row.put("doneRate", percent(done, Math.max(assigned + done, 1)));
                    return row;
                },
                teamId);
    }

    private List<Map<String, Object>> loadProjectRows(String inProjects) {
        return jdbcTemplate.query(
                """
                        select
                            p.name as project,
                            p.code,
                            count(t.id) as total,
                            count(t.id) filter (where t.archived_at is null and coalesce(t.stage, 'Очередь') = 'Очередь') as queue,
                            count(t.id) filter (where t.archived_at is null and t.stage in ('В работе', 'Тестирование')) as in_progress,
                            count(t.id) filter (where t.stage = 'Готово') as done,
                            count(t.id) filter (where t.archived_at is null and t.priority = 'срочно' and coalesce(t.stage, 'Очередь') <> 'Готово') as urgent,
                            count(t.id) filter (where t.archived_at is null and t.due_date is not null and t.due_date < current_date
                                and coalesce(t.stage, 'Очередь') <> 'Готово') as overdue
                        from project p
                        left join board b on b.project_id = p.id
                        left join task_item t on t.board_id = b.id
                        where p.id in (%s)
                        group by p.id, p.name, p.code
                        order by p.name
                        """
                        .formatted(inProjects),
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    int total = rs.getInt("total");
                    row.put("project", rs.getString("project"));
                    row.put("code", rs.getString("code"));
                    row.put("total", total);
                    row.put("queue", rs.getInt("queue"));
                    row.put("inProgress", rs.getInt("in_progress"));
                    row.put("done", rs.getInt("done"));
                    row.put("urgent", rs.getInt("urgent"));
                    row.put("overdue", rs.getInt("overdue"));
                    row.put("doneRate", percent(rs.getInt("done"), Math.max(total, 1)));
                    return row;
                });
    }

    private List<Map<String, Object>> loadRisks(List<Map<String, Object>> projects) {
        return projects.stream()
                .sorted((a, b) -> Integer.compare(
                        intVal(b.get("overdue")) + intVal(b.get("urgent")),
                        intVal(a.get("overdue")) + intVal(a.get("urgent"))))
                .limit(5)
                .map(p -> {
                    Map<String, Object> r = new LinkedHashMap<>(p);
                    int score = intVal(p.get("overdue")) * 2 + intVal(p.get("urgent"));
                    r.put("riskScore", score);
                    r.put("riskLevel", score >= 8 ? "high" : score >= 3 ? "medium" : "low");
                    return r;
                })
                .toList();
    }

    private Map<String, Object> loadLeadTime(String inProjects, int days) {
        List<Integer> samples = jdbcTemplate.query(
                """
                        select extract(epoch from (coalesce(done_at.ts, t.updated_at) - t.created_at)) / 86400 as days
                        from task_item t
                        join board b on b.id = t.board_id
                        left join lateral (
                            select min(h.changed_at) as ts
                            from task_status_history h
                            where h.task_id = t.id and h.new_stage = 'Готово'
                        ) done_at on true
                        where t.stage = 'Готово'
                          and b.project_id in (%s)
                          and coalesce(done_at.ts, t.updated_at)::date >= current_date - ?
                        """.formatted(inProjects),
                (rs, rowNum) -> (int) Math.round(rs.getDouble("days")),
                days);
        if (samples.isEmpty()) {
            return Map.of("avgDays", 0, "medianDays", 0, "sampleSize", 0);
        }
        int sum = samples.stream().mapToInt(Integer::intValue).sum();
        List<Integer> sorted = new ArrayList<>(samples);
        sorted.sort(Integer::compareTo);
        int median = sorted.get(sorted.size() / 2);
        return Map.of(
                "avgDays", Math.round((double) sum / samples.size()),
                "medianDays", median,
                "sampleSize", samples.size());
    }

    private List<Map<String, Object>> loadTopTransitions(String inProjects, int days) {
        return jdbcTemplate.query(
                """
                        select
                            trim(h.old_stage) as from_stage,
                            h.new_stage as to_stage,
                            count(*) as cnt
                        from task_status_history h
                        join task_item t on t.id = h.task_id
                        join board b on b.id = t.board_id
                        where b.project_id in (%s)
                          and h.changed_at::date >= current_date - ?
                          and h.new_stage is not null
                          and h.old_stage is not null
                          and trim(h.old_stage) <> ''
                          and h.old_stage <> h.new_stage
                        group by 1, 2
                        order by cnt desc
                        limit 8
                        """.formatted(inProjects),
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("from", rs.getString("from_stage"));
                    row.put("to", rs.getString("to_stage"));
                    row.put("count", rs.getInt("cnt"));
                    return row;
                },
                days);
    }

    private Map<String, Object> loadWorkloadBalance(List<Map<String, Object>> assignees) {
        if (assignees.isEmpty()) {
            return Map.of("balanced", true, "message", "Нет назначенных задач");
        }
        int max = assignees.stream().mapToInt(a -> intVal(a.get("assigned"))).max().orElse(0);
        int min = assignees.stream().mapToInt(a -> intVal(a.get("assigned"))).min().orElse(0);
        boolean balanced = max - min <= 3 || max <= 5;
        String message = balanced
                ? "Нагрузка распределена относительно равномерно"
                : "Есть перекос: от " + min + " до " + max + " активных задач на участника";
        return Map.of("balanced", balanced, "message", message, "minAssigned", min, "maxAssigned", max);
    }

    private Map<String, Object> buildReportsSummary(
            List<Map<String, Object>> projects, Map<String, Object> kpis, int doneRate, int overdueRate,
            String health) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("projects", projects.size());
        summary.put("tasks", intVal(kpis.get("total")));
        summary.put("done", intVal(kpis.get("done")));
        summary.put("inProgress", intVal(kpis.get("inProgress")));
        summary.put("overdue", intVal(kpis.get("overdue")));
        summary.put("urgent", intVal(kpis.get("urgent")));
        summary.put("doneRate", doneRate);
        summary.put("overdueRate", overdueRate);
        summary.put("health", health);
        Map<String, Object> reports = new LinkedHashMap<>();
        reports.put("summary", summary);
        reports.put("rows", projects);
        return reports;
    }

    private static boolean useDailyWorkdayCharts(int days) {
        return days <= 14;
    }

    private static List<LocalDate> workdaysInPeriod(int periodDays) {
        LocalDate periodStart = LocalDate.now().minusDays(Math.max(0, periodDays - 1));
        LocalDate today = LocalDate.now();
        List<LocalDate> out = new ArrayList<>();
        for (LocalDate d = periodStart; !d.isAfter(today); d = d.plusDays(1)) {
            DayOfWeek dow = d.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) {
                out.add(d);
            }
        }
        return out;
    }

    private static int velocityChartWeeks(int days) {
        int natural = (int) Math.ceil(days / 7.0);
        if (days <= 30) {
            return Math.max(1, natural);
        }
        if (days <= 90) {
            return Math.min(natural, 10);
        }
        return Math.min(natural, 12);
    }

    private static int activityBucketWeeks(int days) {
        if (days <= 30) {
            return 0;
        }
        if (days <= 90) {
            return 10;
        }
        return 12;
    }

    private static int chartWeeks(int days) {
        return Math.min(52, Math.max(1, (int) Math.ceil(days / 7.0)));
    }

    private static String healthLabel(String health) {
        return switch (health) {
            case "high_risk" -> "Высокий риск срыва сроков";
            case "attention" -> "Требует внимания";
            default -> "Стабильное состояние";
        };
    }

    private static String inClause(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return "";
        }
        return ids.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("");
    }

    private static int intVal(Object v) {
        if (v == null) {
            return 0;
        }
        return ((Number) v).intValue();
    }

    private static int percent(int part, int total) {
        if (total <= 0) {
            return 0;
        }
        return Math.min(100, Math.round(100f * part / total));
    }
}
