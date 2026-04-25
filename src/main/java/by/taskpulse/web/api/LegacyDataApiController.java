package by.taskpulse.web.api;

import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LegacyDataApiController {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final String CURRENT_USERNAME = "d.shved";
    private final JdbcTemplate jdbcTemplate;

    public LegacyDataApiController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/api/team")
    public List<Map<String, Object>> team() {
        Long teamId = currentTeamId();
        return jdbcTemplate.query(
                """
                select
                    full_name,
                    coalesce(position, 'Участник команды') as role,
                    coalesce(avatar_file, 'basic_avatar.png') as avatar,
                    public_id as user_public_id
                from app_user u
                join team_membership tm on tm.user_id = u.id
                where tm.team_id = ?
                order by u.full_name
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", rs.getString("full_name"));
                    row.put("role", rs.getString("role"));
                    row.put("avatar", rs.getString("avatar"));
                    row.put("publicId", rs.getString("user_public_id"));
                    return row;
                },
                teamId);
    }

    @GetMapping("/api/me")
    public Map<String, Object> me() {
        Long uid = currentUserId();
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        Map<String, Object> base = jdbcTemplate.queryForMap(
                """
                select
                    u.public_id as user_public_id,
                    u.id,
                    u.full_name,
                    u.email,
                    coalesce(u.username, 'user') as username,
                    coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                    coalesce(u.position, 'Участник команды') as position,
                    coalesce(u.department, 'Команда') as department,
                    coalesce(u.phone, '') as phone,
                    coalesce(u.timezone, 'Europe/Minsk') as timezone,
                    coalesce(u.office, '') as office,
                    coalesce(u.bio, '') as bio,
                    coalesce(to_char(u.team_joined_at, 'TMMonth YYYY'), '') as team_since,
                    coalesce(tm.name, 'Без команды') as team_name,
                    coalesce(tm.public_id, '') as team_public_id,
                    coalesce(org.public_id, '') as organization_public_id
                from app_user u
                left join team_membership tms on tms.user_id = u.id
                left join app_team tm on tm.id = tms.team_id
                left join organization org on org.id = u.organization_id
                where u.id = ?
                order by tm.id
                limit 1
                """,
                uid
        );

        Integer assigned = jdbcTemplate.queryForObject("select count(*) from task_item where assignee_id = ?", Integer.class, uid);
        Integer inProgress = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage in ('В работе','Тестирование')",
                Integer.class, uid);
        Integer weekActivity = jdbcTemplate.queryForObject(
                "select count(*) from task_status_history where changed_by = ? and changed_at >= now() - interval '7 days'",
                Integer.class, uid);
        Integer monthDone = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage = 'Готово' and updated_at >= now() - interval '30 days'",
                Integer.class, uid);

        List<Map<String, Object>> projects = jdbcTemplate.query(
                """
                select p.name as project_name, pm.role as project_role
                from project_member pm
                join project p on p.id = pm.project_id
                where pm.user_id = ?
                  and p.id in (""" + visibleProjectsSql + """
                )
                order by p.name
                limit 6
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("project", rs.getString("project_name"));
                    row.put("role", toHumanProjectRole(rs.getString("project_role")));
                    return row;
                },
                uid
        );

        List<Map<String, Object>> activity = new ArrayList<>();
        activity.add(activityRow("Последний вход", "Сегодня, 09:14 · Chrome · Windows"));
        activity.add(activityRow("Двухфакторная защита", "Выключена"));
        activity.add(activityRow("Календари", "Google Calendar"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", base.get("id"));
        out.put("publicId", base.get("user_public_id"));
        out.put("fullName", base.get("full_name"));
        out.put("email", base.get("email"));
        out.put("username", base.get("username"));
        out.put("avatar", base.get("avatar"));
        out.put("position", base.get("position"));
        out.put("department", base.get("department"));
        out.put("phone", base.get("phone"));
        out.put("timezone", base.get("timezone"));
        out.put("office", base.get("office"));
        out.put("bio", base.get("bio"));
        out.put("teamSince", base.get("team_since"));
        out.put("teamName", base.get("team_name"));
        out.put("teamPublicId", base.get("team_public_id"));
        out.put("organizationPublicId", base.get("organization_public_id"));
        out.put("projects", projects);
        out.put("activity", activity);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("assigned", assigned == null ? 0 : assigned);
        stats.put("inProgress", inProgress == null ? 0 : inProgress);
        stats.put("weekActivity", weekActivity == null ? 0 : weekActivity);
        stats.put("monthDone", monthDone == null ? 0 : monthDone);
        out.put("stats", stats);
        return out;
    }

    @GetMapping("/api/boards")
    public Map<String, Object> boards() {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select
                    b.id as board_id,
                    b.name as board_name,
                    t.id as task_id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name as task_name,
                    t.priority as task_priority,
                    t.due_date as due_date,
                    u.full_name as assignee_name,
                    u.avatar_file as assignee_avatar
                from board b
                left join task_item t on t.board_id = b.id
                left join app_user u on u.id = t.assignee_id
                where b.code like 'LIST%'
                  and b.project_id in (""" + visibleProjectsSql + """
                )
                order by b.id, t.id
                """);

        Map<Long, List<Map<String, Object>>> subtasksByTask = loadSubtasksByTaskId();
        Map<Long, Map<String, Object>> boardsMap = new LinkedHashMap<>();

        for (Map<String, Object> row : rows) {
            Long boardId = ((Number) row.get("board_id")).longValue();
            Map<String, Object> board = boardsMap.computeIfAbsent(boardId, id -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", id);
                m.put("name", row.get("board_name"));
                m.put("tasks", new ArrayList<Map<String, Object>>());
                m.put("archivedTasks", new ArrayList<Map<String, Object>>());
                return m;
            });

            Number taskIdNum = (Number) row.get("task_id");
            if (taskIdNum == null) {
                continue;
            }
            Long taskId = taskIdNum.longValue();
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("id", taskId);
            task.put("displayId", row.get("task_public_id"));
            task.put("name", row.get("task_name"));
            task.put("priority", row.get("task_priority"));
            task.put("dueDate", toUiDate(row.get("due_date")));
            task.put("assignee", row.get("assignee_name"));
            task.put("assigneeAvatar", row.get("assignee_avatar") != null ? row.get("assignee_avatar") : "basic_avatar.png");
            task.put("subtasks", subtasksByTask.getOrDefault(taskId, List.of()));
            ((List<Map<String, Object>>) board.get("tasks")).add(task);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("boards", new ArrayList<>(boardsMap.values()));
        return result;
    }

    @GetMapping("/api/kanban/boards")
    public Map<String, Object> kanbanBoards() {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        List<Map<String, Object>> boards = jdbcTemplate.queryForList(
                """
                select b.id, b.name
                from board b
                where b.code like 'KANBAN%'
                  and b.project_id in (""" + visibleProjectsSql + """
                )
                order by b.id
                """);

        List<Map<String, Object>> resultBoards = new ArrayList<>();
        for (Map<String, Object> b : boards) {
            Long boardId = ((Number) b.get("id")).longValue();
            List<String> stages = jdbcTemplate.query(
                    """
                    select distinct coalesce(nullif(t.stage,''), 'Очередь') as st
                    from task_item t
                    where t.board_id = ?
                    order by st
                    """,
                    (rs, rowNum) -> rs.getString("st"),
                    boardId);
            stages.sort(Comparator.comparingInt(this::stageOrder).thenComparing(s -> s));
            if (stages.isEmpty()) {
                stages = List.of("Очередь", "В работе", "Тестирование", "Готово");
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", boardId);
            row.put("name", b.get("name"));
            row.put("stages", stages);
            row.put("tasksSource", "/api/kanban/tasks?boardId=" + boardId);
            row.put("archivedTasks", List.of());
            resultBoards.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("boards", resultBoards);
        return out;
    }

    @GetMapping("/api/kanban/tasks")
    public Map<String, Object> kanbanTasks(@RequestParam(required = false) Long boardId) {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        String sql = """
                select
                    t.id, coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as public_id, t.board_id, t.name, t.priority, t.due_date, t.stage,
                    u.full_name as assignee_name,
                    u.avatar_file as assignee_avatar
                from task_item t
                join board b on b.id = t.board_id
                left join app_user u on u.id = t.assignee_id
                where b.code like 'KANBAN%'
                  and b.project_id in (""" + visibleProjectsSql + """
                ) """ + (boardId != null ? " and t.board_id = ? " : "") + " order by t.id";

        List<Map<String, Object>> rows = boardId == null
                ? jdbcTemplate.queryForList(sql)
                : jdbcTemplate.queryForList(sql, boardId);

        Map<Long, List<Map<String, Object>>> subtasksByTask = loadSubtasksByTaskId();
        List<Map<String, Object>> tasks = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Long taskId = ((Number) row.get("id")).longValue();
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id", taskId);
            t.put("displayId", row.get("public_id"));
            t.put("boardId", ((Number) row.get("board_id")).longValue());
            t.put("name", row.get("name"));
            t.put("priority", row.get("priority"));
            t.put("dueDate", toUiDate(row.get("due_date")));
            t.put("assignee", row.get("assignee_name"));
            t.put("assigneeAvatar", row.get("assignee_avatar") != null ? row.get("assignee_avatar") : "basic_avatar.png");
            t.put("stage", row.get("stage"));
            t.put("subtasks", subtasksByTask.getOrDefault(taskId, List.of()));
            tasks.add(t);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", tasks);
        return out;
    }

    @GetMapping("/api/tasks")
    public List<Map<String, Object>> tasksTable() {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        return jdbcTemplate.query(
                """
                select
                    t.id, t.task_code, t.name, t.stage, t.priority, t.due_date,
                    t.story_points, t.estimate_hours,
                    a.full_name as assignee_name,
                    a.avatar_file as assignee_avatar,
                    c.full_name as creator_name,
                    c.avatar_file as creator_avatar,
                    p.name as project_name
                from task_item t
                left join app_user a on a.id = t.assignee_id
                left join app_user c on c.id = t.creator_id
                left join board b on b.id = t.board_id
                left join project p on p.id = b.project_id
                where p.id in (""" + visibleProjectsSql + """
                )
                order by t.id
                """,
                (rs, rowNum) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String dueDate = toUiDate(rs.getDate("due_date"));
                    if (dueDate == null) {
                        dueDate = LocalDate.now().plusDays(7).format(DATE_FMT);
                    }
                    m.put("id", rs.getString("task_code") != null ? rs.getString("task_code") : "TSK-" + rs.getLong("id"));
                    m.put("name", rs.getString("name"));
                    m.put("status", toLegacyStatus(rs.getString("stage")));
                    m.put("dueDate", dueDate);
                    m.put("priority", rs.getString("priority"));
                    m.put("createdDate", dueDate);
                    m.put("complexity", rs.getObject("story_points") != null ? rs.getInt("story_points") : 3);
                    String estimate = rs.getObject("estimate_hours") != null ? rs.getBigDecimal("estimate_hours").toPlainString() : "8";
                    m.put("timeEstimate", estimate + "ч");
                    m.put("creator", rs.getString("creator_name"));
                    m.put("creatorRole", "manager");
                    m.put("creatorAvatar", rs.getString("creator_avatar") != null ? rs.getString("creator_avatar") : "basic_avatar.png");
                    m.put("assignee", rs.getString("assignee_name"));
                    m.put("assigneeRole", "member");
                    m.put("assigneeAvatar", rs.getString("assignee_avatar") != null ? rs.getString("assignee_avatar") : "basic_avatar.png");
                    m.put("project", rs.getString("project_name"));
                    return m;
                });
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> projects() {
        Long teamId = currentTeamId();
        return jdbcTemplate.query(
                """
                select
                    p.id,
                    p.name,
                    p.summary,
                    p.code,
                    count(distinct pm.user_id) as team_count,
                    count(distinct b.id) as board_count,
                    count(distinct t.id) as task_count,
                    count(distinct case when t.stage = 'Готово' then t.id end) as done_count
                from project_team my
                join project p on p.id = my.project_id
                left join project_member pm on pm.project_id = p.id
                left join board b on b.project_id = p.id
                left join task_item t on t.board_id = b.id
                where my.team_id = ?
                group by p.id, p.name, p.summary, p.code
                order by p.id
                limit 4
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("summary", rs.getString("summary"));
                    row.put("code", rs.getString("code"));
                    row.put("teamCount", rs.getInt("team_count"));
                    row.put("boardCount", rs.getInt("board_count"));
                    row.put("taskCount", rs.getInt("task_count"));
                    row.put("doneCount", rs.getInt("done_count"));
                    return row;
                },
                teamId
        );
    }

    @GetMapping("/api/index/summary")
    public Map<String, Object> indexSummary() {
        Long uid = currentUserId();
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        List<Map<String, Object>> todo = jdbcTemplate.query(
                """
                select t.name, p.name as project_name, t.due_date
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                where t.assignee_id = ?
                  and p.id in (""" + visibleProjectsSql + """
                )
                order by t.due_date nulls last, t.id
                limit 8
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", rs.getString("name"));
                    row.put("project", rs.getString("project_name"));
                    row.put("dueDate", toUiDate(rs.getDate("due_date")));
                    return row;
                },
                uid
        );

        Integer assigned = jdbcTemplate.queryForObject("select count(*) from task_item where assignee_id = ?", Integer.class, uid);
        Integer inProgress = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage in ('В работе','Тестирование')",
                Integer.class, uid);
        Integer done = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage = 'Готово'",
                Integer.class, uid);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("todo", todo);
        out.put("assigned", assigned == null ? 0 : assigned);
        out.put("inProgress", inProgress == null ? 0 : inProgress);
        out.put("done", done == null ? 0 : done);
        return out;
    }

    @GetMapping("/api/index/mini-chart")
    public Map<String, Object> miniChart() {
        Long uid = currentUserId();
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        List<Integer> team = new ArrayList<>();
        List<Integer> me = new ArrayList<>();
        for (int i = 4; i >= 0; i--) {
            Integer teamValue = jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from task_item t
                    join board b on b.id = t.board_id
                    where t.created_at::date = current_date - ?
                      and b.project_id in (""" + visibleProjectsSql + """
                    )
                    """,
                    Integer.class,
                    i);
            Integer meValue = jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from task_item t
                    join board b on b.id = t.board_id
                    where t.created_at::date = current_date - ?
                      and t.assignee_id = ?
                      and b.project_id in (""" + visibleProjectsSql + """
                    )
                    """,
                    Integer.class,
                    i,
                    uid);
            team.add(teamValue == null ? 0 : teamValue);
            me.add(meValue == null ? 0 : meValue);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("team", team);
        out.put("me", me);
        out.put("min", 0);
        out.put("max", Math.max(10, team.stream().mapToInt(Integer::intValue).max().orElse(10)));
        return out;
    }

    private Map<Long, List<Map<String, Object>>> loadSubtasksByTaskId() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "select task_id, name, completed from subtask order by id");
        Map<Long, List<Map<String, Object>>> map = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            Long taskId = ((Number) r.get("task_id")).longValue();
            List<Map<String, Object>> list = map.computeIfAbsent(taskId, k -> new ArrayList<>());
            Map<String, Object> st = new LinkedHashMap<>();
            st.put("name", r.get("name"));
            st.put("completed", r.get("completed"));
            list.add(st);
        }
        return map;
    }

    private String toLegacyStatus(String stage) {
        if (stage == null) return "neutral";
        return switch (stage) {
            case "В работе" -> "inprocess";
            case "Готово" -> "done";
            case "Тестирование" -> "inprocess";
            case "Отложено" -> "exit";
            default -> "neutral";
        };
    }

    private Long currentUserId() {
        List<Long> ids = jdbcTemplate.query(
                "select id from app_user where username = ? order by id limit 1",
                (rs, rowNum) -> rs.getLong("id"),
                CURRENT_USERNAME
        );
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_user", Long.class);
    }

    private Long currentTeamId() {
        Long uid = currentUserId();
        List<Long> ids = jdbcTemplate.query(
                "select team_id from team_membership where user_id = ? order by team_id limit 1",
                (rs, rowNum) -> rs.getLong("team_id"),
                uid
        );
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_team", Long.class);
    }

    private List<Long> visibleProjectIds() {
        Long teamId = currentTeamId();
        List<Long> ids = jdbcTemplate.query(
                """
                select p.id
                from project_team pt
                join project p on p.id = pt.project_id
                where pt.team_id = ?
                order by p.id
                limit 4
                """,
                (rs, rowNum) -> rs.getLong("id"),
                teamId
        );
        if (!ids.isEmpty()) {
            return ids;
        }
        return jdbcTemplate.query("select id from project order by id limit 4", (rs, rowNum) -> rs.getLong("id"));
    }

    private String inClauseSql(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return "null";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(ids.get(i));
        }
        return sb.toString();
    }

    private String toHumanProjectRole(String role) {
        if (role == null) return "Участник";
        return switch (role) {
            case "owner" -> "Владелец";
            case "manager" -> "Менеджер";
            case "observer" -> "Наблюдатель";
            default -> "Разработка";
        };
    }

    private int stageOrder(String stage) {
        if (stage == null) return 99;
        return switch (stage) {
            case "Очередь" -> 1;
            case "В работе" -> 2;
            case "Тестирование" -> 3;
            case "Готово" -> 4;
            case "Отложено" -> 5;
            default -> 99;
        };
    }

    private Map<String, Object> activityRow(String key, String value) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("value", value);
        return row;
    }

    private String toUiDate(Object sqlDateObj) {
        if (sqlDateObj == null) return null;
        LocalDate d;
        if (sqlDateObj instanceof Date sd) {
            d = sd.toLocalDate();
        } else if (sqlDateObj instanceof LocalDate ld) {
            d = ld;
        } else {
            return String.valueOf(sqlDateObj);
        }
        return d.format(DATE_FMT);
    }
}
