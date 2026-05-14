package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
public class LegacyDataApiController {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final Path TASK_UPLOADS_ROOT = Paths.get("static", "uploads", "tasks");
    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;
    private final HttpServletRequest request;

    public LegacyDataApiController(JdbcTemplate jdbcTemplate,
                                   CurrentUserProvider currentUserProvider,
                                   HttpServletRequest request) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
        this.request = request;
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
                    public_id as user_public_id,
                    exists (
                        select 1
                        from task_status_history h
                        where h.changed_by = u.id
                          and h.changed_at >= now() - interval '2 days'
                    ) as is_online
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
                    row.put("online", rs.getBoolean("is_online") || rowNum < 3);
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
    public Map<String, Object> boards(@RequestParam(required = false) String project) {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        String archiveFilter = hasColumn("board", "archived_at") && hasColumn("project", "archived_at")
                ? " and b.archived_at is null and p.archived_at is null "
                : "";
        String sql = """
                select
                    b.id as board_id,
                    b.name as board_name,
                    t.id as task_id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name as task_name,
                    t.description as task_description,
                    t.stage as task_stage,
                    t.priority as task_priority,
                    t.due_date as due_date,
                    t.start_date as start_date,
                    t.end_date as end_date,
                    t.story_points as story_points,
                    t.estimate_hours as estimate_hours,
                    t.archived_at as archived_at,
                    p.name as project_name,
                    p.project_type as project_type,
                    u.full_name as assignee_name,
                    u.avatar_file as assignee_avatar,
                    dep_out.depends_on_task_id as dep_out_task_id,
                    coalesce(dep_out_t.public_id, dep_out_t.task_code, 'TSK-' || dep_out_t.id::text) as dep_out_task_public_id,
                    dep_out_t.name as dep_out_task_name,
                    dep_in.task_id as dep_in_task_id,
                    coalesce(dep_in_t.public_id, dep_in_t.task_code, 'TSK-' || dep_in_t.id::text) as dep_in_task_public_id,
                    dep_in_t.name as dep_in_task_name
                from board b
                join project p on p.id = b.project_id
                left join task_item t on t.board_id = b.id
                left join app_user u on u.id = t.assignee_id
                left join lateral (
                    select d.depends_on_task_id
                    from task_dependency d
                    where d.task_id = t.id
                    order by d.id desc
                    limit 1
                ) dep_out on true
                left join task_item dep_out_t on dep_out_t.id = dep_out.depends_on_task_id
                left join lateral (
                    select d.task_id
                    from task_dependency d
                    where d.depends_on_task_id = t.id
                    order by d.id desc
                    limit 1
                ) dep_in on true
                left join task_item dep_in_t on dep_in_t.id = dep_in.task_id
                where b.code like 'LIST%'
                """ + archiveFilter + """
                  and b.project_id in (""" + visibleProjectsSql + """
                ) """ + (project != null && !project.isBlank() ? " and p.code = ? " : "") + " order by b.id, t.id";
        List<Map<String, Object>> rows = (project != null && !project.isBlank())
                ? jdbcTemplate.queryForList(sql, project)
                : jdbcTemplate.queryForList(sql);

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
            task.put("description", row.get("task_description"));
            task.put("stage", row.get("task_stage"));
            task.put("priority", row.get("task_priority"));
            task.put("dueDate", toUiDate(row.get("due_date")));
            task.put("startDate", toUiDate(row.get("start_date")));
            task.put("endDate", toUiDate(row.get("end_date")));
            task.put("storyPoints", row.get("story_points"));
            Object estimate = row.get("estimate_hours");
            task.put("timeEstimateHours", estimate instanceof java.math.BigDecimal bd ? formatEstimateHours(bd) : null);
            task.put("project", row.get("project_name"));
            task.put("projectType", row.get("project_type"));
            task.put("archivedDate", toIsoDateTime(row.get("archived_at")));
            task.put("assignee", row.get("assignee_name"));
            task.put("assigneeAvatar", row.get("assignee_avatar"));
            Object depOutId = row.get("dep_out_task_id");
            Object depInId = row.get("dep_in_task_id");
            if (depOutId != null) {
                task.put("dependencyTaskId", ((Number) depOutId).longValue());
                task.put("dependencyType", "blocked_by");
                task.put("dependencyLabel", row.get("dep_out_task_public_id") + " — " + row.get("dep_out_task_name"));
            } else if (depInId != null) {
                task.put("dependencyTaskId", ((Number) depInId).longValue());
                task.put("dependencyType", "blocks");
                task.put("dependencyLabel", row.get("dep_in_task_public_id") + " — " + row.get("dep_in_task_name"));
            } else {
                task.put("dependencyTaskId", null);
                task.put("dependencyType", null);
                task.put("dependencyLabel", null);
            }
            task.put("subtasks", subtasksByTask.getOrDefault(taskId, List.of()));
            ((List<Map<String, Object>>) board.get("tasks")).add(task);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("boards", new ArrayList<>(boardsMap.values()));
        return result;
    }

    @GetMapping("/api/kanban/boards")
    public Map<String, Object> kanbanBoards(@RequestParam(required = false) String project) {
        try {
        boolean withProjectFilter = project != null && !project.isBlank();
        String visibleProjectsSql = withProjectFilter ? null : inClauseSql(visibleProjectIdsSafe());
        boolean hasSprintStartedAt = hasColumn("board", "sprint_started_at");
        boolean hasSprintFinishedAt = hasColumn("board", "sprint_finished_at");
        boolean hasProjectPublicId = hasColumn("project", "public_id");
        String archiveFilter = hasColumn("board", "archived_at") && hasColumn("project", "archived_at")
                ? " and b.archived_at is null and p.archived_at is null "
                : "";
        String boardKindFilter = withProjectFilter ? "" : " and (b.code like 'KANBAN%' or b.code like 'SCRUM%') ";
        String projectTypeFilter = withProjectFilter ? "" : " and p.project_type in ('kanban', 'scrum', 'scrumban') ";
        String projectFilter = withProjectFilter
                ? (hasProjectPublicId
                ? " and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.public_id as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?) "
                : " and (lower(p.code) = lower(?) or lower(p.name) = lower(?) or cast(p.id as text) = ?) ")
                : " and b.project_id in (" + visibleProjectsSql + ") ";
        String sql = """
                select b.id, b.name, p.project_type
                """ + (hasSprintStartedAt ? ", b.sprint_started_at" : ", null as sprint_started_at")
                + (hasSprintFinishedAt ? ", b.sprint_finished_at" : ", null as sprint_finished_at") + """
                from board b
                join project p on p.id = b.project_id
                where 1=1
                """ + archiveFilter + """
                """ + boardKindFilter + projectTypeFilter + projectFilter + " order by b.id";
        List<Map<String, Object>> boards;
        try {
            if (withProjectFilter && hasProjectPublicId) {
                boards = jdbcTemplate.queryForList(sql, project, project, project, project);
            } else if (withProjectFilter) {
                boards = jdbcTemplate.queryForList(sql, project, project, project);
            } else {
                boards = jdbcTemplate.queryForList(sql);
            }
        } catch (Exception ex) {
            if (!withProjectFilter) throw ex;
            String fallbackSql = """
                    select b.id, b.name, p.project_type
                    """ + (hasSprintStartedAt ? ", b.sprint_started_at" : ", null as sprint_started_at")
                    + (hasSprintFinishedAt ? ", b.sprint_finished_at" : ", null as sprint_finished_at") + """
                    from board b
                    join project p on p.id = b.project_id
                    where (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?)
                    order by b.id
                    """;
            boards = jdbcTemplate.queryForList(fallbackSql, project, project, project);
        }

        List<Map<String, Object>> resultBoards = new ArrayList<>();
        for (Map<String, Object> b : boards) {
            Long boardId = ((Number) b.get("id")).longValue();
            String projectType = b.get("project_type") == null ? "kanban" : String.valueOf(b.get("project_type"));
            String boardName = b.get("name") == null ? "" : String.valueOf(b.get("name"));
            List<String> stages = resolveBoardStages(boardId, projectType, boardName);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", boardId);
            row.put("name", b.get("name"));
            row.put("stages", stages);
            row.put("sprintStartedAt", toIsoDateTime(b.get("sprint_started_at")));
            row.put("sprintFinishedAt", toIsoDateTime(b.get("sprint_finished_at")));
            row.put("tasksSource", "/api/kanban/tasks?boardId=" + boardId + (project != null && !project.isBlank() ? "&project=" + project : ""));
            row.put("archivedTasks", List.of());
            resultBoards.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("boards", resultBoards);
        return out;
        } catch (Exception ex) {
            return kanbanBoardsFallback(project);
        }
    }

    @GetMapping("/api/kanban/tasks")
    public Map<String, Object> kanbanTasks(@RequestParam(required = false) Long boardId,
                                           @RequestParam(required = false) String project) {
        try {
        boolean withProjectFilter = project != null && !project.isBlank();
        String visibleProjectsSql = withProjectFilter ? null : inClauseSql(visibleProjectIdsSafe());
        boolean hasProjectPublicId = hasColumn("project", "public_id");
        String archiveFilter = hasColumn("board", "archived_at") && hasColumn("project", "archived_at")
                ? " and b.archived_at is null and p.archived_at is null "
                : "";
        String boardKindFilter = withProjectFilter ? "" : " and (b.code like 'KANBAN%' or b.code like 'SCRUM%') ";
        String projectFilter = withProjectFilter
                ? (hasProjectPublicId
                ? " and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.public_id as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?) "
                : " and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?) ")
                : " and b.project_id in (" + visibleProjectsSql + ") ";
        String sql = """
                select
                    t.id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as public_id,
                    t.board_id,
                    t.name,
                    t.description,
                    t.priority,
                    t.due_date,
                    t.start_date,
                    t.end_date,
                    t.stage,
                    t.story_points,
                    t.estimate_hours,
                    t.archived_at,
                    p.name as project_name,
                    p.project_type as project_type,
                    u.full_name as assignee_name,
                    u.avatar_file as assignee_avatar,
                    dep_out.depends_on_task_id as dep_out_task_id,
                    coalesce(dep_out_t.public_id, dep_out_t.task_code, 'TSK-' || dep_out_t.id::text) as dep_out_task_public_id,
                    dep_out_t.name as dep_out_task_name,
                    dep_in.task_id as dep_in_task_id,
                    coalesce(dep_in_t.public_id, dep_in_t.task_code, 'TSK-' || dep_in_t.id::text) as dep_in_task_public_id,
                    dep_in_t.name as dep_in_task_name
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                left join app_user u on u.id = t.assignee_id
                left join lateral (
                    select d.depends_on_task_id
                    from task_dependency d
                    where d.task_id = t.id
                    order by d.id desc
                    limit 1
                ) dep_out on true
                left join task_item dep_out_t on dep_out_t.id = dep_out.depends_on_task_id
                left join lateral (
                    select d.task_id
                    from task_dependency d
                    where d.depends_on_task_id = t.id
                    order by d.id desc
                    limit 1
                ) dep_in on true
                left join task_item dep_in_t on dep_in_t.id = dep_in.task_id
                where 1=1
                """ + archiveFilter + """
                """ + boardKindFilter + projectFilter
                + (boardId != null ? " and t.board_id = ? " : "") + " order by t.id";

        List<Map<String, Object>> rows;
        try {
            if (withProjectFilter && hasProjectPublicId && boardId != null) {
                rows = jdbcTemplate.queryForList(sql, project, project, project, project, boardId);
            } else if (withProjectFilter && hasProjectPublicId) {
                rows = jdbcTemplate.queryForList(sql, project, project, project, project);
            } else if (withProjectFilter && boardId != null) {
                rows = jdbcTemplate.queryForList(sql, project, project, project, boardId);
            } else if (withProjectFilter) {
                rows = jdbcTemplate.queryForList(sql, project, project, project);
            } else if (boardId != null) {
                rows = jdbcTemplate.queryForList(sql, boardId);
            } else {
                rows = jdbcTemplate.queryForList(sql);
            }
        } catch (Exception ex) {
            if (!withProjectFilter) throw ex;
            String fallbackSql = """
                    select
                        t.id,
                        coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as public_id,
                        t.board_id,
                        t.name,
                        t.description,
                        t.priority,
                        t.due_date,
                        t.start_date,
                        t.end_date,
                        t.stage,
                        t.story_points,
                        t.estimate_hours,
                        t.archived_at,
                        p.name as project_name,
                        p.project_type as project_type,
                        u.full_name as assignee_name,
                        u.avatar_file as assignee_avatar,
                        null::bigint as dep_out_task_id,
                        null::text as dep_out_task_public_id,
                        null::text as dep_out_task_name,
                        null::bigint as dep_in_task_id,
                        null::text as dep_in_task_public_id,
                        null::text as dep_in_task_name
                    from task_item t
                    join board b on b.id = t.board_id
                    join project p on p.id = b.project_id
                    left join app_user u on u.id = t.assignee_id
                    where (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?)
                    """ + (boardId != null ? " and t.board_id = ? " : "") + """
                    order by t.id
                    """;
            rows = boardId != null
                    ? jdbcTemplate.queryForList(fallbackSql, project, project, project, boardId)
                    : jdbcTemplate.queryForList(fallbackSql, project, project, project);
        }

        Map<Long, List<Map<String, Object>>> subtasksByTask = loadSubtasksByTaskId();
        List<Map<String, Object>> tasks = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Long taskId = ((Number) row.get("id")).longValue();
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id", taskId);
            t.put("displayId", row.get("public_id"));
            t.put("boardId", ((Number) row.get("board_id")).longValue());
            t.put("name", row.get("name"));
            t.put("description", row.get("description"));
            t.put("priority", row.get("priority"));
            t.put("dueDate", toUiDate(row.get("due_date")));
            t.put("startDate", toUiDate(row.get("start_date")));
            t.put("endDate", toUiDate(row.get("end_date")));
            t.put("assignee", row.get("assignee_name"));
            t.put("assigneeAvatar", row.get("assignee_avatar"));
            t.put("stage", row.get("stage"));
            Object spObj = row.get("story_points");
            t.put("storyPoints", spObj == null ? null : ((Number) spObj).intValue());
            Object estObj = row.get("estimate_hours");
            t.put("timeEstimateHours", estObj == null ? null : formatEstimateHours((java.math.BigDecimal) estObj));
            t.put("project", row.get("project_name"));
            t.put("projectType", row.get("project_type"));
            t.put("archivedDate", toIsoDateTime(row.get("archived_at")));
            Object depOutId = row.get("dep_out_task_id");
            Object depInId = row.get("dep_in_task_id");
            if (depOutId != null) {
                t.put("dependencyTaskId", ((Number) depOutId).longValue());
                t.put("dependencyType", "blocked_by");
                t.put("dependencyLabel", row.get("dep_out_task_public_id") + " — " + row.get("dep_out_task_name"));
            } else if (depInId != null) {
                t.put("dependencyTaskId", ((Number) depInId).longValue());
                t.put("dependencyType", "blocks");
                t.put("dependencyLabel", row.get("dep_in_task_public_id") + " — " + row.get("dep_in_task_name"));
            } else {
                t.put("dependencyTaskId", null);
                t.put("dependencyType", null);
                t.put("dependencyLabel", null);
            }
            t.put("subtasks", subtasksByTask.getOrDefault(taskId, List.of()));
            tasks.add(t);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", tasks);
        return out;
        } catch (Exception ex) {
            return kanbanTasksFallback(boardId, project);
        }
    }

    @PostMapping("/api/kanban/tasks/move")
    public Map<String, Object> moveKanbanTask(@RequestBody Map<String, Object> payload) {
        Number taskIdNum = (Number) payload.get("taskId");
        Number boardIdNum = (Number) payload.get("boardId");
        String stage = payload.get("stage") == null ? null : String.valueOf(payload.get("stage"));
        String priority = payload.get("priority") == null ? null : String.valueOf(payload.get("priority"));
        if (taskIdNum == null || boardIdNum == null || stage == null || stage.isBlank()) {
            throw new IllegalArgumentException("taskId, boardId и stage обязательны");
        }
        long taskId = taskIdNum.longValue();
        long boardId = boardIdNum.longValue();
        Map<String, Object> oldRow = jdbcTemplate.queryForMap(
                "select stage as old_stage, archived_at as old_archived_at from task_item where id = ?",
                taskId
        );
        String oldStage = oldRow.get("old_stage") == null ? null : String.valueOf(oldRow.get("old_stage"));
        Object oldArchivedAt = oldRow.get("old_archived_at");
        Object nextArchivedAt = "Готово".equals(stage)
                ? ("Готово".equals(oldStage) ? oldArchivedAt : Timestamp.from(Instant.now()))
                : null;
        Long uid = currentUserId();
        int updated = jdbcTemplate.update(
                """
                update task_item
                set board_id = ?, stage = ?, priority = ?, archived_at = ?, updated_at = now()
                where id = ?
                """,
                boardId,
                stage,
                (priority == null || priority.isBlank()) ? "обычный" : priority,
                nextArchivedAt,
                taskId
        );
        if (updated == 0) {
            throw new IllegalArgumentException("Задача не найдена");
        }
        jdbcTemplate.update(
                "insert into task_status_history(task_id, changed_by, old_stage, new_stage, changed_at) values (?, ?, ?, ?, now())",
                taskId, uid, null, stage
        );
        return Map.of("ok", true);
    }

    @PostMapping("/api/kanban/subtasks/toggle")
    public Map<String, Object> toggleSubtask(@RequestBody Map<String, Object> payload) {
        Number subtaskIdNum = (Number) payload.get("subtaskId");
        Object completedRaw = payload.get("completed");
        if (subtaskIdNum == null || completedRaw == null) {
            throw new IllegalArgumentException("subtaskId и completed обязательны");
        }
        boolean completed = Boolean.parseBoolean(String.valueOf(completedRaw));
        long subtaskId = subtaskIdNum.longValue();
        String stage = jdbcTemplate.queryForObject(
                """
                select t.stage
                from subtask s
                join task_item t on t.id = s.task_id
                where s.id = ?
                """,
                String.class,
                subtaskId
        );
        if ("Очередь".equals(stage)) {
            throw new IllegalStateException("Нельзя менять подзадачи в статусе Очередь");
        }
        int updated = jdbcTemplate.update("update subtask set completed = ? where id = ?", completed, subtaskId);
        if (updated == 0) {
            throw new IllegalArgumentException("Подзадача не найдена");
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/kanban/tasks/create")
    public Map<String, Object> createKanbanTask(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = (Number) payload.get("boardId");
        String name = payload.get("name") == null ? null : String.valueOf(payload.get("name")).trim();
        String stage = payload.get("stage") == null ? null : String.valueOf(payload.get("stage")).trim();
        String priority = payload.get("priority") == null ? null : String.valueOf(payload.get("priority")).trim();
        String dueIso = payload.get("dueDate") == null ? null : String.valueOf(payload.get("dueDate")).trim();
        String startIso = payload.get("startDate") == null ? null : String.valueOf(payload.get("startDate")).trim();
        String endIso = payload.get("endDate") == null ? null : String.valueOf(payload.get("endDate")).trim();
        String description = payload.get("description") == null ? null : String.valueOf(payload.get("description")).trim();
        String dependencyType = payload.get("dependencyType") == null ? null : String.valueOf(payload.get("dependencyType")).trim();
        Number dependencyTaskIdNum = payload.get("dependencyTaskId") instanceof Number n ? n : null;

        Object storyPointsObj = payload.get("storyPoints");
        Object estimateHoursObj = payload.get("estimateHours");
        String assigneeName = payload.get("assignee") == null ? null : String.valueOf(payload.get("assignee")).trim();

        if (boardIdNum == null || name == null || name.isBlank()) {
            throw new IllegalArgumentException("boardId и name обязательны");
        }

        if (stage == null || stage.isBlank()) stage = "Очередь";
        if (priority == null || priority.isBlank()) priority = "обычный";
        Timestamp archivedAt = "Готово".equals(stage) ? Timestamp.from(Instant.now()) : null;

        Long teamId = currentTeamId();
        Long creatorId = currentUserId();

        Map<String, Object> boardRow = jdbcTemplate.queryForMap(
                """
                select
                    b.id as board_id,
                    p.code as project_code
                from board b
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where b.id = ?
                  and pt.team_id = ?
                limit 1
                """,
                boardIdNum.longValue(), teamId
        );

        Long boardId = ((Number) boardRow.get("board_id")).longValue();
        String projectCode = String.valueOf(boardRow.get("project_code"));

        Long assigneeId = null;
        if (assigneeName != null && !assigneeName.isBlank()) {
            List<Long> ids = jdbcTemplate.query(
                    """
                    select u.id
                    from app_user u
                    join team_membership tm on tm.user_id = u.id
                    where tm.team_id = ?
                      and u.full_name = ?
                    limit 1
                    """,
                    (rs, rowNum) -> rs.getLong("id"),
                    teamId, assigneeName
            );
            if (!ids.isEmpty()) assigneeId = ids.get(0);
        }

        Integer nextN = jdbcTemplate.queryForObject(
                """
                select coalesce(max(substring(task_code from '[0-9]+$')::int), 0) + 1
                from task_item
                where task_code like ?
                """,
                Integer.class,
                projectCode + "-%"
        );
        String taskCode = projectCode + "-" + nextN;

        java.sql.Date startDate = null;
        java.sql.Date endDate = null;
        java.sql.Date dueDate = null;
        if (startIso != null && !startIso.isBlank()) startDate = Date.valueOf(java.time.LocalDate.parse(startIso));
        if (endIso != null && !endIso.isBlank()) endDate = Date.valueOf(java.time.LocalDate.parse(endIso));
        if (dueIso != null && !dueIso.isBlank()) dueDate = Date.valueOf(java.time.LocalDate.parse(dueIso));
        if (dueDate == null) dueDate = endDate != null ? endDate : startDate;

        Integer storyPoints = null;
        if (storyPointsObj != null) {
            if (storyPointsObj instanceof Number n) storyPoints = n.intValue();
            else storyPoints = Integer.parseInt(String.valueOf(storyPointsObj));
        }

        java.math.BigDecimal estimateHours = null;
        if (estimateHoursObj != null && !String.valueOf(estimateHoursObj).isBlank()) {
            estimateHours = new java.math.BigDecimal(String.valueOf(estimateHoursObj));
        }

        jdbcTemplate.update(
                """
                insert into task_item(
                    name, stage, priority, due_date, board_id, assignee_id, creator_id,
                    task_code, description, story_points, estimate_hours, start_date, end_date, archived_at
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                name, stage, priority, dueDate, boardId, assigneeId, creatorId,
                taskCode, description, storyPoints, estimateHours, startDate, endDate, archivedAt
        );

        Long taskId = jdbcTemplate.queryForObject(
                "select id from task_item where task_code = ? order by id desc limit 1",
                Long.class,
                taskCode
        );
        if (taskId != null && dependencyTaskIdNum != null && dependencyTaskIdNum.longValue() > 0
                && dependencyType != null && !dependencyType.isBlank()) {
            saveTaskDependency(taskId, dependencyTaskIdNum.longValue(), dependencyType);
        }

        return Map.of("ok", true, "taskCode", taskCode, "taskId", taskId);
    }

    @PostMapping("/api/kanban/tasks/update")
    public Map<String, Object> updateKanbanTask(@RequestBody Map<String, Object> payload) {
        Number taskIdNum = (Number) payload.get("taskId");
        if (taskIdNum == null) throw new IllegalArgumentException("taskId обязателен");
        Long taskId = taskIdNum.longValue();

        Long teamId = currentTeamId();
        Long uid = currentUserId();

        String name = payload.get("name") == null ? null : String.valueOf(payload.get("name")).trim();
        String description = payload.get("description") == null ? null : String.valueOf(payload.get("description")).trim();
        String stage = payload.get("stage") == null ? null : String.valueOf(payload.get("stage")).trim();
        String priority = payload.get("priority") == null ? null : String.valueOf(payload.get("priority")).trim();
        String dueIso = payload.get("dueDate") == null ? null : String.valueOf(payload.get("dueDate")).trim();
        String startIso = payload.get("startDate") == null ? null : String.valueOf(payload.get("startDate")).trim();
        String endIso = payload.get("endDate") == null ? null : String.valueOf(payload.get("endDate")).trim();
        String assigneeName = payload.get("assignee") == null ? null : String.valueOf(payload.get("assignee")).trim();
        Object storyPointsObj = payload.get("storyPoints");
        Object estimateHoursObj = payload.get("estimateHours");
        String dependencyType = payload.get("dependencyType") == null ? null : String.valueOf(payload.get("dependencyType")).trim();
        Number dependencyTaskIdNum = payload.get("dependencyTaskId") instanceof Number n ? n : null;

        if (name == null || name.isBlank()) throw new IllegalArgumentException("name обязателен");
        if (stage == null || stage.isBlank()) stage = "Очередь";
        if (priority == null || priority.isBlank()) priority = "обычный";

        java.sql.Date startDate = null;
        java.sql.Date endDate = null;
        java.sql.Date dueDate = null;
        if (startIso != null && !startIso.isBlank()) startDate = Date.valueOf(java.time.LocalDate.parse(startIso));
        if (endIso != null && !endIso.isBlank()) endDate = Date.valueOf(java.time.LocalDate.parse(endIso));
        if (dueIso != null && !dueIso.isBlank()) dueDate = Date.valueOf(java.time.LocalDate.parse(dueIso));
        if (dueDate == null) dueDate = endDate != null ? endDate : startDate;

        Long assigneeId = null;
        if (assigneeName != null && !assigneeName.isBlank()) {
            List<Long> ids = jdbcTemplate.query(
                    """
                    select u.id
                    from app_user u
                    join team_membership tm on tm.user_id = u.id
                    where tm.team_id = ?
                      and u.full_name = ?
                    limit 1
                    """,
                    (rs, rowNum) -> rs.getLong("id"),
                    teamId, assigneeName
            );
            if (!ids.isEmpty()) assigneeId = ids.get(0);
        }

        Integer storyPoints = null;
        if (storyPointsObj != null && storyPointsObj instanceof Number n) storyPoints = n.intValue();
        if (storyPointsObj != null && !(storyPointsObj instanceof Number)) {
            String spRaw = String.valueOf(storyPointsObj).trim();
            if (!spRaw.isEmpty()) storyPoints = Integer.parseInt(spRaw);
        }

        java.math.BigDecimal estimateHours = null;
        if (estimateHoursObj != null && estimateHoursObj instanceof Number n) estimateHours = new java.math.BigDecimal(String.valueOf(n));
        if (estimateHoursObj != null && !(estimateHoursObj instanceof Number)) {
            String hRaw = String.valueOf(estimateHoursObj).trim();
            if (!hRaw.isEmpty()) estimateHours = new java.math.BigDecimal(hRaw);
        }

        Map<String, Object> oldRow = jdbcTemplate.queryForMap(
                """
                select t.stage as old_stage
                     , t.archived_at as old_archived_at
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where t.id = ?
                  and pt.team_id = ?
                limit 1
                """,
                taskId, teamId
        );
        String oldStage = String.valueOf(oldRow.get("old_stage"));
        Object oldArchivedAt = oldRow.get("old_archived_at");
        Object nextArchivedAt = "Готово".equals(stage)
                ? ("Готово".equals(oldStage) ? oldArchivedAt : Timestamp.from(Instant.now()))
                : null;

        jdbcTemplate.update(
                """
                update task_item
                set
                    name = ?,
                    description = ?,
                    stage = ?,
                    priority = ?,
                    due_date = ?,
                    start_date = ?,
                    end_date = ?,
                    assignee_id = ?,
                    story_points = ?,
                    estimate_hours = ?,
                    archived_at = ?,
                    updated_at = now()
                where id = ?
                """,
                name, description, stage, priority, dueDate, startDate, endDate, assigneeId, storyPoints, estimateHours, nextArchivedAt, taskId
        );
        jdbcTemplate.update("delete from task_dependency where task_id = ? or depends_on_task_id = ?", taskId, taskId);
        if (dependencyTaskIdNum != null && dependencyTaskIdNum.longValue() > 0
                && dependencyType != null && !dependencyType.isBlank()) {
            saveTaskDependency(taskId, dependencyTaskIdNum.longValue(), dependencyType);
        }

        if (!stage.equals(oldStage)) {
            jdbcTemplate.update(
                    "insert into task_status_history(task_id, changed_by, old_stage, new_stage, changed_at) values (?, ?, ?, ?, now())",
                    taskId, uid, oldStage, stage
            );
        }

        if ("Готово".equals(stage)) {
            jdbcTemplate.update("update subtask set completed = true where task_id = ?", taskId);
        }
        if ("Очередь".equals(stage)) {
            jdbcTemplate.update("update subtask set completed = false where task_id = ?", taskId);
        }

        return Map.of("ok", true);
    }

    @PostMapping("/api/kanban/tasks/attachments/upload")
    public Map<String, Object> uploadTaskAttachment(@RequestParam Long taskId,
                                                    @RequestParam("file") MultipartFile file) {
        if (taskId == null || taskId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "taskId обязателен");
        }
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Файл не выбран");
        }

        Long teamId = currentTeamId();
        Long userId = currentUserId();
        Integer allowed = jdbcTemplate.queryForObject(
                """
                select count(*)
                from task_item t
                join board b on b.id = t.board_id
                join project_team pt on pt.project_id = b.project_id
                where t.id = ? and pt.team_id = ?
                """,
                Integer.class,
                taskId, teamId
        );
        if (allowed == null || allowed == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к задаче");
        }

        String original = file.getOriginalFilename() == null ? "file" : Path.of(file.getOriginalFilename()).getFileName().toString();
        String stored = UUID.randomUUID().toString().replace("-", "") + "_" + original;
        String ym = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        Path dir = TASK_UPLOADS_ROOT.resolve(ym);
        Path out = dir.resolve(stored);
        try {
            Files.createDirectories(dir);
            file.transferTo(out);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить файл");
        }

        String fileUrl = "/static/uploads/tasks/" + ym + "/" + stored;
        jdbcTemplate.update(
                """
                insert into task_attachment(task_id, uploaded_by, file_name, file_url, created_at)
                values (?, ?, ?, ?, now())
                """,
                taskId, userId, original, fileUrl
        );

        return Map.of(
                "ok", true,
                "fileName", original,
                "fileUrl", fileUrl
        );
    }

    @GetMapping("/api/kanban/tasks/attachments")
    public List<Map<String, Object>> taskAttachments(@RequestParam Long taskId) {
        if (taskId == null || taskId <= 0) return List.of();
        Long teamId = currentTeamId();
        Integer allowed = jdbcTemplate.queryForObject(
                """
                select count(*)
                from task_item t
                join board b on b.id = t.board_id
                join project_team pt on pt.project_id = b.project_id
                where t.id = ? and pt.team_id = ?
                """,
                Integer.class,
                taskId, teamId
        );
        if (allowed == null || allowed == 0) return List.of();
        return jdbcTemplate.query(
                """
                select id, file_name, file_url, created_at
                from task_attachment
                where task_id = ?
                order by created_at desc, id desc
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("file_name"));
                    row.put("url", rs.getString("file_url"));
                    row.put("createdAt", rs.getTimestamp("created_at") == null ? null : rs.getTimestamp("created_at").toInstant().toString());
                    return row;
                },
                taskId
        );
    }

    @PostMapping("/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachment(@RequestParam Long attachmentId) {
        if (attachmentId == null || attachmentId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "attachmentId обязателен");
        }
        Long teamId = currentTeamId();
        Integer allowed = jdbcTemplate.queryForObject(
                """
                select count(*)
                from task_attachment ta
                join task_item t on t.id = ta.task_id
                join board b on b.id = t.board_id
                join project_team pt on pt.project_id = b.project_id
                where ta.id = ? and pt.team_id = ?
                """,
                Integer.class,
                attachmentId, teamId
        );
        if (allowed == null || allowed == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к вложению");
        }
        jdbcTemplate.update("delete from task_attachment where id = ?", attachmentId);
        return Map.of("ok", true);
    }

    @GetMapping("/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachmentGet(@RequestParam Long attachmentId) {
        return deleteTaskAttachment(attachmentId);
    }

    @GetMapping("/api/tasks")
    public List<Map<String, Object>> tasksTable() {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        return jdbcTemplate.query(
                """
                select
                    t.id, t.task_code, t.name, t.stage, t.priority, t.due_date, t.created_at, t.updated_at,
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
                    String stage = rs.getString("stage");
                    m.put("id", rs.getString("task_code") != null ? rs.getString("task_code") : "TSK-" + rs.getLong("id"));
                    m.put("name", rs.getString("name"));
                    m.put("status", toLegacyStatus(stage));
                    m.put("dueDate", dueDate);
                    m.put("completedDate", "Готово".equals(stage) ? toUiDate(rs.getDate("updated_at")) : null);
                    m.put("priority", rs.getString("priority"));
                    m.put("createdDate", toUiDate(rs.getDate("created_at")));
                    m.put("complexity", rs.getObject("story_points") != null ? rs.getInt("story_points") : 3);
                    String estimate = rs.getObject("estimate_hours") != null ? formatEstimateHours(rs.getBigDecimal("estimate_hours")) : "8";
                    m.put("timeEstimate", estimate + "ч");
                    m.put("creator", rs.getString("creator_name"));
                    m.put("creatorRole", "manager");
                    m.put("creatorAvatar", rs.getString("creator_avatar") != null ? rs.getString("creator_avatar") : "basic_avatar.png");
                    m.put("assignee", rs.getString("assignee_name") != null ? rs.getString("assignee_name") : "—");
                    m.put("assigneeRole", "member");
                    m.put("assigneeAvatar", rs.getString("assignee_avatar"));
                    m.put("project", rs.getString("project_name"));
                    return m;
                });
    }

    @GetMapping("/api/tasks/assigned")
    public List<Map<String, Object>> assignedTasks() {
        Long uid = currentUserId();
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        return jdbcTemplate.query(
                """
                select
                    t.id, t.task_code, t.name, t.stage, t.priority, t.due_date, t.created_at, t.updated_at,
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
                  and t.assignee_id = ?
                  and coalesce(t.stage, 'Очередь') <> 'Готово'
                order by
                  case when t.priority = 'срочно' then 0 else 1 end,
                  t.due_date nulls last,
                  t.id
                """,
                (rs, rowNum) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String dueDate = toUiDate(rs.getDate("due_date"));
                    String stage = rs.getString("stage");
                    m.put("id", rs.getString("task_code") != null ? rs.getString("task_code") : "TSK-" + rs.getLong("id"));
                    m.put("name", rs.getString("name"));
                    m.put("status", toLegacyStatus(stage));
                    m.put("dueDate", dueDate);
                    m.put("completedDate", null);
                    m.put("priority", rs.getString("priority"));
                    m.put("createdDate", toUiDate(rs.getDate("created_at")));
                    m.put("complexity", rs.getObject("story_points") != null ? rs.getInt("story_points") : 3);
                    String estimate = rs.getObject("estimate_hours") != null ? formatEstimateHours(rs.getBigDecimal("estimate_hours")) : "8";
                    m.put("timeEstimate", estimate + "ч");
                    m.put("creator", rs.getString("creator_name"));
                    m.put("creatorRole", "manager");
                    m.put("creatorAvatar", rs.getString("creator_avatar") != null ? rs.getString("creator_avatar") : "basic_avatar.png");
                    m.put("assignee", rs.getString("assignee_name") != null ? rs.getString("assignee_name") : "—");
                    m.put("assigneeRole", "member");
                    m.put("assigneeAvatar", rs.getString("assignee_avatar"));
                    m.put("project", rs.getString("project_name"));
                    return m;
                },
                uid
        );
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> projects(@RequestParam(defaultValue = "team") String scope,
                                              @RequestParam(defaultValue = "false") boolean archived) {
        Long teamId = currentTeamId();
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) return List.of();
        String inSql = inClauseSql(visibleIds);

        boolean hasProjectArchived = hasColumn("project", "archived_at");
        boolean hasProjectCode = hasColumn("project", "code");
        boolean hasProjectSummary = hasColumn("project", "summary");
        boolean hasProjectType = hasColumn("project", "project_type");
        boolean hasProjectOrg = hasColumn("project", "organization_id");
        boolean hasTeamName = hasColumn("app_team", "name");

        if (archived && !hasProjectArchived) return List.of();

        String scopeWhere;
        if ("organization".equalsIgnoreCase(scope) && hasProjectOrg) {
            scopeWhere = " p.organization_id = (select t.organization_id from app_team t where t.id = ?) ";
        } else {
            scopeWhere = " p.id in (" + inSql + ") ";
        }

        String archivedCond = hasProjectArchived
                ? (archived ? " and p.archived_at is not null " : " and p.archived_at is null ")
                : "";

        String codeExpr = hasProjectCode ? "p.code" : "cast(null as text)";
        String summaryExpr = hasProjectSummary ? "p.summary" : "cast('' as text)";
        String typeExpr = hasProjectType ? "p.project_type" : "cast('list' as varchar)";
        String teamNameExpr = hasTeamName
                ? "(select t.name from app_team t where t.id = ?)"
                : "cast('—' as text)";

        List<Object> params = new ArrayList<>();
        if (hasTeamName) params.add(teamId);
        if ("organization".equalsIgnoreCase(scope) && hasProjectOrg) params.add(teamId);

        String sql = "select p.id, p.name, " + summaryExpr + " as summary, "
                + codeExpr + " as code, "
                + typeExpr + " as project_type, "
                + teamNameExpr + " as team_name, "
                + "(select count(*) from board b where b.project_id = p.id) as board_count, "
                + "(select count(*) from task_item ti join board b on b.id = ti.board_id where b.project_id = p.id) as task_count, "
                + "(select count(*) from task_item ti join board b on b.id = ti.board_id where b.project_id = p.id and coalesce(ti.stage,'') = 'Готово') as done_count, "
                + "(select count(*) from task_item ti join board b on b.id = ti.board_id where b.project_id = p.id and coalesce(ti.stage,'') in ('В работе','Тестирование')) as in_progress_count, "
                + "(select count(*) from task_item ti join board b on b.id = ti.board_id where b.project_id = p.id and coalesce(ti.stage,'') in ('Очередь','Новая','Назначена')) as todo_count, "
                + "(select count(*) from board b where b.project_id = p.id and (coalesce(b.code,'') like 'KANBAN%' or coalesce(b.code,'') like 'SCRUM%')) as kanban_board_count, "
                + "(select count(*) from board b where b.project_id = p.id and coalesce(b.code,'') like 'LIST%') as list_board_count "
                + "from project p where " + scopeWhere + " "
                + archivedCond + " order by p.id";
        List<Map<String, Object>> rows = jdbcTemplate.query(
                sql,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("summary", rs.getString("summary"));
                    row.put("code", rs.getString("code"));
                    row.put("type", rs.getString("project_type"));
                    row.put("teamName", rs.getString("team_name"));
                    row.put("teamCount", 0);
                    row.put("boardCount", rs.getInt("board_count"));
                    row.put("taskCount", rs.getInt("task_count"));
                    row.put("doneCount", rs.getInt("done_count"));
                    row.put("inProgressCount", rs.getInt("in_progress_count"));
                    row.put("todoCount", rs.getInt("todo_count"));
                    row.put("kanbanBoardCount", rs.getInt("kanban_board_count"));
                    row.put("listBoardCount", rs.getInt("list_board_count"));
                    String projectType = rs.getString("project_type");
                    String view = switch (projectType) {
                        case "kanban" -> "kanban";
                        case "scrum" -> "scrum";
                        default -> "list";
                    };
                    row.put("view", view);
                    return row;
                },
                params.toArray()
        );

        return rows.stream()
                .filter(r -> r.get("code") != null && !String.valueOf(r.get("code")).isBlank())
                .toList();
    }

    @GetMapping("/api/projects/archived")
    public List<Map<String, Object>> archivedProjects(@RequestParam(defaultValue = "team") String scope) {
        return projects(scope, true);
    }

    @PostMapping("/api/projects/archive")
    public Map<String, Object> archiveProject(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null : String.valueOf(payload.get("projectCode")).trim();
        if (projectCode == null || projectCode.isBlank()) throw new IllegalArgumentException("projectCode обязателен");
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        int updated = jdbcTemplate.update(
                """
                update project p
                set archived_at = now(), archived_by = ?
                where p.code = ?
                  and p.id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                uid, projectCode, teamId
        );
        if (updated == 0) throw new IllegalArgumentException("Проект не найден");
        jdbcTemplate.update(
                """
                update board b
                set archived_at = now(), archived_by = ?
                where b.project_id = (select p.id from project p where p.code = ?)
                """,
                uid, projectCode
        );
        return Map.of("ok", true);
    }

    @PostMapping("/api/projects/restore")
    public Map<String, Object> restoreProject(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null : String.valueOf(payload.get("projectCode")).trim();
        if (projectCode == null || projectCode.isBlank()) throw new IllegalArgumentException("projectCode обязателен");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                update project p
                set archived_at = null, archived_by = null
                where p.code = ?
                  and p.id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                projectCode, teamId
        );
        if (updated == 0) throw new IllegalArgumentException("Проект не найден");
        jdbcTemplate.update(
                """
                update board b
                set archived_at = null, archived_by = null
                where b.project_id = (select p.id from project p where p.code = ?)
                """,
                projectCode
        );
        return Map.of("ok", true);
    }

    @GetMapping("/api/boards/archived")
    public List<Map<String, Object>> archivedBoards(@RequestParam String projectCode) {
        Long teamId = currentTeamId();
        return jdbcTemplate.query(
                """
                select b.id, b.name, b.code, b.archived_at,
                       p.code as project_code
                from board b
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and p.code = ?
                  and b.archived_at is not null
                order by b.archived_at desc nulls last, b.id desc
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("code", rs.getString("code"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("archivedDate", toIsoDateTime(rs.getObject("archived_at")));
                    return row;
                },
                teamId, projectCode
        );
    }

    @PostMapping("/api/boards/create")
    public Map<String, Object> createBoard(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null : String.valueOf(payload.get("projectCode")).trim();
        String name = payload.get("name") == null ? null : String.valueOf(payload.get("name")).trim();
        String view = payload.get("view") == null ? null : String.valueOf(payload.get("view")).trim().toLowerCase();
        if (projectCode == null || projectCode.isBlank() || name == null || name.isBlank()) {
            throw new IllegalArgumentException("projectCode и name обязательны");
        }
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        Map<String, Object> prj = jdbcTemplate.queryForMap(
                """
                select p.id, p.project_type
                from project p
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and p.code = ?
                limit 1
                """,
                teamId, projectCode
        );
        Long projectId = ((Number) prj.get("id")).longValue();
        String projectType = String.valueOf(prj.get("project_type"));
        boolean isKanban = "kanban".equals(view) || "kanban".equals(projectType) || "scrum".equals(projectType) || "scrumban".equals(projectType);
        String prefix;
        if ("scrum".equals(view) || "scrum".equals(projectType)) prefix = "SCRUM";
        else prefix = isKanban ? "KANBAN" : "LIST";
        Integer nextNo = jdbcTemplate.queryForObject(
                """
                select coalesce(max((nullif(regexp_replace(coalesce(code,''), '[^0-9]', '', 'g'), ''))::int),0) + 1
                from board
                where project_id = ?
                  and code like ?
                """,
                Integer.class,
                projectId, prefix + "%"
        );
        String boardCode = prefix + "_" + nextNo;
        Integer nextPos = jdbcTemplate.queryForObject(
                "select coalesce(max(position_no),0)+1 from board where project_id = ?",
                Integer.class,
                projectId
        );
        jdbcTemplate.update(
                """
                insert into board(name, project_id, code, created_at, archived_at, archived_by, position_no)
                values (?, ?, ?, now(), null, null, ?)
                """,
                name, projectId, boardCode, nextPos
        );
        Long boardId = jdbcTemplate.queryForObject(
                "select id from board where project_id = ? and code = ? order by id desc limit 1",
                Long.class,
                projectId, boardCode
        );
        if (isKanban) {
            List<String> stages = loadDefaultBoardStages(projectType, name);
            for (int i = 0; i < stages.size(); i++) {
                jdbcTemplate.update(
                        "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                        boardId, stages.get(i), i + 1
                );
            }
        }
        return Map.of("ok", true, "boardId", boardId, "boardCode", boardCode);
    }

    @PostMapping("/api/scrum/sprints/start")
    public Map<String, Object> startSprint(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        Long boardId = boardIdNum.longValue();
        boolean hasSprintStartedAt = hasColumn("board", "sprint_started_at");
        boolean hasSprintFinishedAt = hasColumn("board", "sprint_finished_at");
        String sprintSql;
        if (hasSprintStartedAt && hasSprintFinishedAt) {
            sprintSql = """
                update board b
                set sprint_started_at = coalesce(sprint_started_at, now()),
                    sprint_finished_at = null
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """;
        } else {
            sprintSql = """
                update board b
                set name = b.name
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """;
        }
        int updated = jdbcTemplate.update(sprintSql, boardId, teamId);
        if (updated == 0) throw new IllegalArgumentException("Доска не найдена");
        jdbcTemplate.update(
                """
                update task_item
                set stage = case
                    when stage = 'Следующий спринт' then 'Очередь'
                    when stage = 'Через 2 спринта' then 'Следующий спринт'
                    when stage = 'Через 3+ спринта' then 'Через 2 спринта'
                    else stage
                end
                where board_id = ?
                  and stage in ('Следующий спринт', 'Через 2 спринта', 'Через 3+ спринта')
                """,
                boardId
        );
        Integer backlogCount = jdbcTemplate.queryForObject(
                """
                select count(*)
                from task_item
                where board_id = ?
                  and stage in ('Новые задачи', 'Следующий спринт', 'Через 2 спринта', 'Через 3+ спринта', 'Отложено')
                """,
                Integer.class,
                boardId
        );
        if (backlogCount == null || backlogCount == 0) {
            Long creatorId = currentUserId();
            Long assigneeId = creatorId;
            List<Map<String, String>> seeds = List.of(
                    Map.of("name", "Уточнить критерии приёмки для пользовательских историй", "stage", "Новые задачи"),
                    Map.of("name", "Подготовить задачи для следующего планирования спринта", "stage", "Следующий спринт"),
                    Map.of("name", "Сверить технические зависимости со смежной командой", "stage", "Через 2 спринта"),
                    Map.of("name", "Сформировать идеи улучшений для будущих релизов", "stage", "Через 3+ спринта"),
                    Map.of("name", "Вернуться к задаче после стабилизации текущего релиза", "stage", "Отложено")
            );
            for (Map<String, String> seed : seeds) {
                jdbcTemplate.update(
                        """
                        insert into task_item(name, stage, priority, due_date, board_id, assignee_id, creator_id)
                        values (?, ?, 'обычный', null, ?, ?, ?)
                        """,
                        seed.get("name"),
                        seed.get("stage"),
                        boardId,
                        assigneeId,
                        creatorId
                );
            }
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/scrum/sprints/finish")
    public Map<String, Object> finishSprint(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        boolean hasSprintStartedAt = hasColumn("board", "sprint_started_at");
        boolean hasSprintFinishedAt = hasColumn("board", "sprint_finished_at");
        String sprintSql;
        if (hasSprintStartedAt && hasSprintFinishedAt) {
            sprintSql = """
                update board b
                set sprint_started_at = coalesce(sprint_started_at, now()),
                    sprint_finished_at = now()
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """;
        } else {
            sprintSql = """
                update board b
                set name = b.name
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """;
        }
        int updated = jdbcTemplate.update(sprintSql, boardIdNum.longValue(), teamId);
        if (updated == 0) throw new IllegalArgumentException("Доска не найдена");
        return Map.of("ok", true);
    }

    @PostMapping("/api/scrum/boards/consolidate")
    public Map<String, Object> consolidateScrumBoards(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null : String.valueOf(payload.get("projectCode")).trim();
        if (projectCode == null || projectCode.isBlank()) {
            throw new IllegalArgumentException("projectCode обязателен");
        }
        Long teamId = currentTeamId();
        List<Map<String, Object>> boards = jdbcTemplate.queryForList(
                """
                select b.id, b.name, b.sprint_started_at, b.sprint_finished_at
                from board b
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?)
                  and p.project_type = 'scrum'
                order by b.id
                """,
                teamId, projectCode, projectCode, projectCode
        );
        if (boards.size() <= 1) return Map.of("ok", true, "movedBoards", 0);

        Map<String, Object> primary = null;
        for (Map<String, Object> b : boards) {
            if (b.get("sprint_started_at") != null && b.get("sprint_finished_at") == null) {
                primary = b;
                break;
            }
        }
        if (primary == null) primary = boards.get(0);
        Long primaryBoardId = ((Number) primary.get("id")).longValue();
        String primaryName = String.valueOf(primary.get("name"));
        Integer sprintNum = null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)спринт\\s*(\\d+)").matcher(primaryName);
        if (m.find()) {
            try { sprintNum = Integer.parseInt(m.group(1)); } catch (Exception ignored) {}
        }
        if (sprintNum == null) {
            int maxNum = 0;
            for (Map<String, Object> b : boards) {
                String nm = String.valueOf(b.get("name"));
                java.util.regex.Matcher mm = java.util.regex.Pattern.compile("(?i)спринт\\s*(\\d+)").matcher(nm);
                if (mm.find()) {
                    try { maxNum = Math.max(maxNum, Integer.parseInt(mm.group(1))); } catch (Exception ignored) {}
                }
            }
            sprintNum = Math.max(1, maxNum);
        }
        jdbcTemplate.update("update board set name = ? where id = ?", "Спринт " + sprintNum, primaryBoardId);

        boolean hasBoardArchivedAt = hasColumn("board", "archived_at");
        boolean hasBoardArchivedBy = hasColumn("board", "archived_by");
        Long uid = currentUserId();
        int movedBoards = 0;
        for (Map<String, Object> b : boards) {
            Long bid = ((Number) b.get("id")).longValue();
            if (bid.equals(primaryBoardId)) continue;
            jdbcTemplate.update("update task_item set board_id = ? where board_id = ?", primaryBoardId, bid);
            if (hasBoardArchivedAt && hasBoardArchivedBy) {
                jdbcTemplate.update("update board set archived_at = now(), archived_by = ? where id = ?", uid, bid);
            } else if (hasBoardArchivedAt) {
                jdbcTemplate.update("update board set archived_at = now() where id = ?", bid);
            }
            movedBoards++;
        }
        return Map.of("ok", true, "primaryBoardId", primaryBoardId, "movedBoards", movedBoards);
    }

    @PostMapping("/api/boards/rename")
    public Map<String, Object> renameBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String name = payload.get("name") == null ? null : String.valueOf(payload.get("name")).trim();
        if (boardIdNum == null || name == null || name.isBlank()) throw new IllegalArgumentException("boardId и name обязательны");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                update board b
                set name = ?
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                name, boardIdNum.longValue(), teamId
        );
        if (updated == 0) throw new IllegalArgumentException("Доска не найдена");
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/archive")
    public Map<String, Object> archiveBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        int updated = jdbcTemplate.update(
                """
                update board b
                set archived_at = now(), archived_by = ?
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                uid, boardIdNum.longValue(), teamId
        );
        if (updated == 0) throw new IllegalArgumentException("Доска не найдена");
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/restore")
    public Map<String, Object> restoreBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        boolean withTasks = payload.get("withTasks") == null || Boolean.parseBoolean(String.valueOf(payload.get("withTasks")));
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                update board b
                set archived_at = null, archived_by = null
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                boardIdNum.longValue(), teamId
        );
        if (updated == 0) throw new IllegalArgumentException("Доска не найдена");
        if (!withTasks) {
            jdbcTemplate.update("delete from task_item where board_id = ?", boardIdNum.longValue());
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/duplicate")
    public Map<String, Object> duplicateBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        Map<String, Object> src = jdbcTemplate.queryForMap(
                """
                select b.id, b.name, b.project_id, b.code
                from board b
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                boardIdNum.longValue(), teamId
        );
        Long srcBoardId = ((Number) src.get("id")).longValue();
        Long projectId = ((Number) src.get("project_id")).longValue();
        String srcCode = String.valueOf(src.get("code"));
        String prefix = srcCode != null && srcCode.startsWith("KANBAN") ? "KANBAN" : "LIST";
        Integer nextNo = jdbcTemplate.queryForObject(
                """
                select coalesce(max((nullif(regexp_replace(coalesce(code,''), '[^0-9]', '', 'g'), ''))::int),0) + 1
                from board
                where project_id = ?
                  and code like ?
                """,
                Integer.class,
                projectId, prefix + "%"
        );
        String newCode = prefix + "_" + nextNo;
        Integer nextPos = jdbcTemplate.queryForObject(
                "select coalesce(max(position_no),0)+1 from board where project_id = ?",
                Integer.class,
                projectId
        );
        jdbcTemplate.update(
                "insert into board(name, project_id, code, created_at, position_no) values (?, ?, ?, now(), ?)",
                String.valueOf(src.get("name")) + " (копия)", projectId, newCode, nextPos
        );
        Long newBoardId = jdbcTemplate.queryForObject(
                "select id from board where project_id = ? and code = ? order by id desc limit 1",
                Long.class,
                projectId, newCode
        );
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select stage_name, position from board_stage where board_id = ? order by position",
                srcBoardId
        );
        for (Map<String, Object> s : stages) {
            jdbcTemplate.update(
                    "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                    newBoardId, String.valueOf(s.get("stage_name")), ((Number) s.get("position")).intValue()
            );
        }
        return Map.of("ok", true, "boardId", newBoardId);
    }

    @GetMapping("/api/boards/export")
    public Map<String, Object> exportBoard(@RequestParam Long boardId) {
        Long teamId = currentTeamId();
        Map<String, Object> board = jdbcTemplate.queryForMap(
                """
                select b.id, b.name, b.code
                from board b
                where b.id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                boardId, teamId
        );
        List<Map<String, Object>> tasks = jdbcTemplate.queryForList(
                """
                select id, coalesce(public_id, task_code, 'TSK-'||id::text) as display_id, name, stage, priority
                from task_item
                where board_id = ?
                order by id
                """,
                boardId
        );
        return Map.of("board", board, "tasks", tasks);
    }

    @PostMapping("/api/boards/stages/add")
    public Map<String, Object> addBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        if (boardIdNum == null || stageName == null || stageName.isBlank()) throw new IllegalArgumentException("boardId и stageName обязательны");
        Long teamId = currentTeamId();
        Integer nextPos = jdbcTemplate.queryForObject(
                """
                select coalesce(max(bs.position),0)+1
                from board_stage bs
                join board b on b.id = bs.board_id
                where bs.board_id = ?
                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                """,
                Integer.class,
                boardIdNum.longValue(), teamId
        );
        jdbcTemplate.update("insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                boardIdNum.longValue(), stageName, nextPos);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/rename")
    public Map<String, Object> renameBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String oldName = payload.get("oldName") == null ? null : String.valueOf(payload.get("oldName")).trim();
        String newName = payload.get("newName") == null ? null : String.valueOf(payload.get("newName")).trim();
        if (boardIdNum == null || oldName == null || newName == null || newName.isBlank()) throw new IllegalArgumentException("boardId, oldName, newName обязательны");
        Long teamId = currentTeamId();
        jdbcTemplate.update(
                """
                update board_stage bs
                set stage_name = ?
                where bs.board_id = ?
                  and bs.stage_name = ?
                  and bs.board_id in (
                    select b.id from board b
                    where b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                  )
                """,
                newName, boardIdNum.longValue(), oldName, teamId
        );
        jdbcTemplate.update("update task_item set stage = ? where board_id = ? and stage = ?",
                newName, boardIdNum.longValue(), oldName);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/move")
    public Map<String, Object> moveBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        String direction = payload.get("direction") == null ? null : String.valueOf(payload.get("direction")).trim();
        if (boardIdNum == null || stageName == null || direction == null) throw new IllegalArgumentException("boardId, stageName, direction обязательны");
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select id, stage_name, position from board_stage where board_id = ? order by position",
                boardIdNum.longValue()
        );
        int idx = -1;
        for (int i = 0; i < stages.size(); i++) if (stageName.equals(String.valueOf(stages.get(i).get("stage_name")))) idx = i;
        if (idx == -1) return Map.of("ok", true);
        int to = "up".equalsIgnoreCase(direction) ? idx - 1 : idx + 1;
        if (to < 0 || to >= stages.size()) return Map.of("ok", true);
        Long idA = ((Number) stages.get(idx).get("id")).longValue();
        Long idB = ((Number) stages.get(to).get("id")).longValue();
        int posA = ((Number) stages.get(idx).get("position")).intValue();
        int posB = ((Number) stages.get(to).get("position")).intValue();
        jdbcTemplate.update("update board_stage set position = ? where id = ?", posB, idA);
        jdbcTemplate.update("update board_stage set position = ? where id = ?", posA, idB);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/clear")
    public Map<String, Object> clearBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        if (boardIdNum == null || stageName == null) throw new IllegalArgumentException("boardId и stageName обязательны");
        String fallback = jdbcTemplate.query(
                "select stage_name from board_stage where board_id = ? order by position",
                (rs, rowNum) -> rs.getString(1),
                boardIdNum.longValue()
        ).stream().filter(s -> "Очередь".equals(s)).findFirst().orElse("Очередь");
        jdbcTemplate.update("update task_item set stage = ? where board_id = ? and stage = ?",
                fallback, boardIdNum.longValue(), stageName);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/delete")
    public Map<String, Object> deleteBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        if (boardIdNum == null || stageName == null) throw new IllegalArgumentException("boardId и stageName обязательны");
        clearBoardStage(payload);
        jdbcTemplate.update("delete from board_stage where board_id = ? and stage_name = ?",
                boardIdNum.longValue(), stageName);
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select id from board_stage where board_id = ? order by position, id",
                boardIdNum.longValue()
        );
        for (int i = 0; i < stages.size(); i++) {
            jdbcTemplate.update("update board_stage set position = ? where id = ?", i + 1, ((Number) stages.get(i).get("id")).longValue());
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/reset")
    public Map<String, Object> resetBoardStages(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null) throw new IllegalArgumentException("boardId обязателен");
        jdbcTemplate.update("delete from board_stage where board_id = ?", boardIdNum.longValue());
        List<String> stages = List.of("Очередь", "В работе", "Готово");
        for (int i = 0; i < stages.size(); i++) {
            jdbcTemplate.update(
                    "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                    boardIdNum.longValue(), stages.get(i), i + 1
            );
        }
        return Map.of("ok", true);
    }

    @GetMapping("/api/task-form/options")
    public Map<String, Object> taskFormOptions(@RequestParam(required = false) String project,
                                               @RequestParam(required = false) String q) {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        String query = q == null ? "" : q.trim().toLowerCase();
        boolean hasQ = !query.isBlank();
        String projectsSql = """
                select p.id, p.name, p.code, p.project_type
                from project p
                where p.id in (""" + visibleProjectsSql + """
                ) """ + (hasQ ? " and (lower(p.name) like ? or lower(p.code) like ?) " : "") + """
                order by p.name
                limit 20
                """;
        List<Map<String, Object>> projects = hasQ
                ? jdbcTemplate.query(projectsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("code", rs.getString("code"));
                    row.put("type", rs.getString("project_type"));
                    return row;
                }, "%" + query + "%", "%" + query + "%")
                : jdbcTemplate.query(projectsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("code", rs.getString("code"));
                    row.put("type", rs.getString("project_type"));
                    return row;
                });

        Long teamId = currentTeamId();
        List<Map<String, Object>> assignees = hasQ
                ? jdbcTemplate.query(
                """
                select u.id, u.full_name
                from app_user u
                join team_membership tm on tm.user_id = u.id
                where tm.team_id = ?
                  and lower(u.full_name) like ?
                order by u.full_name
                limit 20
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("full_name"));
                    return row;
                },
                teamId, "%" + query + "%")
                : jdbcTemplate.query(
                """
                select u.id, u.full_name
                from app_user u
                join team_membership tm on tm.user_id = u.id
                where tm.team_id = ?
                order by u.full_name
                limit 20
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("full_name"));
                    return row;
                },
                teamId
        );

        String dependencySql = """
                select
                    t.id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                where p.id in (""" + visibleProjectsSql + """
                ) """ + (project != null && !project.isBlank() ? " and p.code = ? " : "")
                + (hasQ ? " and (lower(t.name) like ? or lower(coalesce(t.public_id, t.task_code, '')) like ?) " : "") + """
                order by t.id desc
                limit 20
                """;
        List<Map<String, Object>> dependencies = (project != null && !project.isBlank() && hasQ)
                ? jdbcTemplate.query(dependencySql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("displayId", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    return row;
                }, project, "%" + query + "%", "%" + query + "%")
                : (project != null && !project.isBlank())
                ? jdbcTemplate.query(dependencySql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("displayId", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    return row;
                }, project)
                : hasQ
                ? jdbcTemplate.query(dependencySql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("displayId", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    return row;
                }, "%" + query + "%", "%" + query + "%")
                : jdbcTemplate.query(dependencySql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("displayId", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    return row;
                });

        String boardsSql = """
                select b.id, b.name, p.code as project_code, p.name as project_name
                from board b
                join project p on p.id = b.project_id
                where p.id in (""" + visibleProjectsSql + """
                ) """ + (project != null && !project.isBlank() ? " and p.code = ? " : "")
                + (hasQ ? " and (lower(b.name) like ? or lower(p.name) like ? or lower(p.code) like ?) " : "") + """
                order by p.name, b.name
                limit 50
                """;
        List<Map<String, Object>> boards = (project != null && !project.isBlank() && hasQ)
                ? jdbcTemplate.query(boardsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("projectName", rs.getString("project_name"));
                    return row;
                }, project, "%" + query + "%", "%" + query + "%", "%" + query + "%")
                : (project != null && !project.isBlank())
                ? jdbcTemplate.query(boardsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("projectName", rs.getString("project_name"));
                    return row;
                }, project)
                : hasQ
                ? jdbcTemplate.query(boardsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("projectName", rs.getString("project_name"));
                    return row;
                }, "%" + query + "%", "%" + query + "%", "%" + query + "%")
                : jdbcTemplate.query(boardsSql, (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getLong("id"));
                    row.put("name", rs.getString("name"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("projectName", rs.getString("project_name"));
                    return row;
                });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projects", projects);
        out.put("boards", boards);
        out.put("assignees", assignees);
        out.put("dependencies", dependencies);
        return out;
    }

    @GetMapping("/api/index/summary")
    public Map<String, Object> indexSummary() {
        Long uid = currentUserId();
        Long teamId = currentTeamId();
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        List<Map<String, Object>> todo = jdbcTemplate.query(
                """
                select
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name,
                    p.name as project_name,
                    t.due_date,
                    t.priority
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                where t.assignee_id is null
                  and coalesce(t.stage, 'Очередь') <> 'Готово'
                  and p.id in (""" + visibleProjectsSql + """
                )
                order by t.due_date nulls last, t.id
                limit 10
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    row.put("project", rs.getString("project_name"));
                    row.put("dueDate", toUiDate(rs.getDate("due_date")));
                    row.put("priority", rs.getString("priority"));
                    return row;
                }
        );

        Integer assigned = jdbcTemplate.queryForObject("select count(*) from task_item where assignee_id = ?", Integer.class, uid);
        Integer inProgress = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage in ('В работе','Тестирование')",
                Integer.class, uid);
        Integer done = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage = 'Готово'",
                Integer.class, uid);

        List<Map<String, Object>> activeProjects = jdbcTemplate.query(
                """
                select
                    p.id,
                    p.name,
                    coalesce(p.summary, '') as summary,
                    count(t.id) as total_count,
                    count(case when t.stage = 'Готово' then 1 end) as done_count,
                    count(case when t.stage in ('В работе','Тестирование') then 1 end) as in_progress_count,
                    count(case when coalesce(t.stage,'Очередь') = 'Очередь' then 1 end) as queue_count
                from project p
                join project_team pt on pt.project_id = p.id
                left join board b on b.project_id = p.id
                left join task_item t on t.board_id = b.id
                where pt.team_id = ?
                  and p.id in (""" + visibleProjectsSql + """
                )
                group by p.id, p.name, p.summary
                order by count(case when t.stage in ('В работе','Тестирование','Очередь') then 1 end) desc, p.id
                limit 2
                """,
                (rs, rowNum) -> {
                    int total = rs.getInt("total_count");
                    int doneCount = rs.getInt("done_count");
                    int inProgressCount = rs.getInt("in_progress_count");
                    int queueCount = Math.max(0, total - doneCount - inProgressCount);
                    int donePercent = percent(doneCount, total);
                    int inProgressPercent = percent(inProgressCount, total);
                    int queuePercent = Math.max(0, 100 - donePercent - inProgressPercent);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", rs.getString("name"));
                    row.put("summary", rs.getString("summary"));
                    row.put("donePercent", donePercent);
                    row.put("inProgressPercent", inProgressPercent);
                    row.put("queuePercent", queuePercent);
                    return row;
                },
                teamId
        );

        List<Map<String, Object>> team = jdbcTemplate.query(
                """
                select
                    u.full_name,
                    coalesce(u.position, 'Участник команды') as role,
                    coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                    exists (
                        select 1
                        from task_status_history h
                        where h.changed_by = u.id
                          and h.changed_at >= now() - interval '2 days'
                    ) as is_online
                from app_user u
                join team_membership tm on tm.user_id = u.id
                where tm.team_id = ?
                order by case tm.role when 'lead' then 0 else 1 end, u.full_name
                limit 5
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", rs.getString("full_name"));
                    row.put("role", rs.getString("role"));
                    row.put("avatar", rs.getString("avatar"));
                    row.put("online", rs.getBoolean("is_online") || rowNum < 3);
                    return row;
                },
                teamId
        );

        List<Map<String, Object>> recentActions = jdbcTemplate.query(
                """
                select
                    coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name as task_name,
                    p.name as project_name,
                    h.new_stage as new_stage,
                    h.changed_at as changed_at
                from task_status_history h
                join task_item t on t.id = h.task_id
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                join app_user u on u.id = h.changed_by
                where p.id in (""" + visibleProjectsSql + """
                )
                order by h.changed_at desc
                limit 5
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("avatar", rs.getString("avatar"));
                    row.put("id", rs.getString("task_public_id"));
                    row.put("name", rs.getString("task_name"));
                    row.put("project", rs.getString("project_name"));
                    row.put("status", toLegacyStatus(rs.getString("new_stage")));
                    row.put("date", rs.getTimestamp("changed_at") == null ? "" : rs.getTimestamp("changed_at").toLocalDateTime().format(DateTimeFormatter.ofPattern("dd.MM HH:mm")));
                    return row;
                }
        );
        if (recentActions.isEmpty()) {
            recentActions = jdbcTemplate.query(
                    """
                    select
                        coalesce(a.avatar_file, c.avatar_file, 'basic_avatar.png') as avatar,
                        coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                        t.name as task_name,
                        p.name as project_name,
                        t.stage as stage_name,
                        t.updated_at as changed_at
                    from task_item t
                    join board b on b.id = t.board_id
                    join project p on p.id = b.project_id
                    left join app_user a on a.id = t.assignee_id
                    left join app_user c on c.id = t.creator_id
                    where p.id in (""" + visibleProjectsSql + """
                    )
                    order by t.updated_at desc nulls last, t.id desc
                    limit 5
                    """,
                    (rs, rowNum) -> {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("avatar", rs.getString("avatar"));
                        row.put("id", rs.getString("task_public_id"));
                        row.put("name", rs.getString("task_name"));
                        row.put("project", rs.getString("project_name"));
                        row.put("status", toLegacyStatus(rs.getString("stage_name")));
                        row.put("date", rs.getTimestamp("changed_at") == null ? "" : rs.getTimestamp("changed_at").toLocalDateTime().format(DateTimeFormatter.ofPattern("dd.MM HH:mm")));
                        return row;
                    }
            );
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("todo", todo);
        out.put("assigned", assigned == null ? 0 : assigned);
        out.put("inProgress", inProgress == null ? 0 : inProgress);
        out.put("done", done == null ? 0 : done);
        out.put("activeProjects", activeProjects);
        out.put("team", team);
        out.put("recentActions", recentActions);
        return out;
    }

    @GetMapping("/api/reports/projects")
    public Map<String, Object> projectReports(@RequestParam(defaultValue = "all") String mode) {
        String visibleProjectsSql = inClauseSql(visibleProjectIds());
        String boardCondition = switch (mode) {
            case "list" -> " and b.code like 'LIST%'";
            case "kanban" -> " and (b.code like 'KANBAN%' or b.code like 'SCRUM%')";
            case "scrum" -> " and (b.code like 'KANBAN%' or b.code like 'SCRUM%')";
            default -> "";
        };

        List<Map<String, Object>> rows = jdbcTemplate.query(
                """
                select
                    p.id,
                    p.name,
                    p.code,
                    count(distinct b.id) as board_count,
                    count(t.id) as total_count,
                    count(case when coalesce(t.stage, 'Очередь') = 'Очередь' then 1 end) as queue_count,
                    count(case when t.stage in ('В работе', 'Тестирование') then 1 end) as in_progress_count,
                    count(case when t.stage = 'Готово' then 1 end) as done_count,
                    count(case when t.priority = 'срочно' and coalesce(t.stage, 'Очередь') <> 'Готово' then 1 end) as urgent_count,
                    count(case when t.due_date is not null and t.due_date < current_date and coalesce(t.stage, 'Очередь') <> 'Готово' then 1 end) as overdue_count
                from project p
                left join board b on b.project_id = p.id """ + boardCondition + """
                left join task_item t on t.board_id = b.id
                where p.id in (""" + visibleProjectsSql + """
                )
                group by p.id, p.name, p.code
                order by p.name
                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("project", rs.getString("name"));
                    row.put("code", rs.getString("code"));
                    row.put("boards", rs.getInt("board_count"));
                    row.put("total", rs.getInt("total_count"));
                    row.put("queue", rs.getInt("queue_count"));
                    row.put("inProgress", rs.getInt("in_progress_count"));
                    row.put("done", rs.getInt("done_count"));
                    row.put("urgent", rs.getInt("urgent_count"));
                    row.put("overdue", rs.getInt("overdue_count"));
                    return row;
                }
        );

        int totalTasks = rows.stream().mapToInt(r -> ((Number) r.get("total")).intValue()).sum();
        int totalOverdue = rows.stream().mapToInt(r -> ((Number) r.get("overdue")).intValue()).sum();
        int totalUrgent = rows.stream().mapToInt(r -> ((Number) r.get("urgent")).intValue()).sum();
        int totalDone = rows.stream().mapToInt(r -> ((Number) r.get("done")).intValue()).sum();
        int totalInProgress = rows.stream().mapToInt(r -> ((Number) r.get("inProgress")).intValue()).sum();
        int doneRate = percent(totalDone, totalTasks);
        int overdueRate = percent(totalOverdue, Math.max(totalTasks, 1));
        String health = overdueRate >= 25 ? "high_risk" : overdueRate >= 10 ? "attention" : "stable";

        List<Map<String, Object>> topRiskProjects = rows.stream()
                .sorted((a, b) -> Integer.compare(
                        ((Number) b.get("overdue")).intValue() + ((Number) b.get("urgent")).intValue(),
                        ((Number) a.get("overdue")).intValue() + ((Number) a.get("urgent")).intValue()
                ))
                .limit(3)
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("summary", Map.of(
                "projects", rows.size(),
                "tasks", totalTasks,
                "done", totalDone,
                "inProgress", totalInProgress,
                "urgent", totalUrgent,
                "overdue", totalOverdue
        ));
        out.put("executive", Map.of(
                "doneRate", doneRate,
                "overdueRate", overdueRate,
                "health", health
        ));
        out.put("topRisks", topRiskProjects);
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
                "select id, task_id, name, completed from subtask order by id");
        Map<Long, List<Map<String, Object>>> map = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            Long taskId = ((Number) r.get("task_id")).longValue();
            List<Map<String, Object>> list = map.computeIfAbsent(taskId, k -> new ArrayList<>());
            Map<String, Object> st = new LinkedHashMap<>();
            st.put("id", ((Number) r.get("id")).longValue());
            st.put("name", r.get("name"));
            st.put("completed", r.get("completed"));
            list.add(st);
        }
        return map;
    }

    private String toLegacyStatus(String stage) {
        if (stage == null) return "neutral";
        return switch (stage) {
            case "Новая" -> "neutral";
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
                currentUsername()
        );
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_user", Long.class);
    }

    private Long currentTeamId() {
        Long contextTeam = contextTeamIdFromRequest();
        if (contextTeam != null) return contextTeam;
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

    private Long contextTeamIdFromRequest() {
        try {
            String uri = request != null ? request.getRequestURI() : null;
            if (uri == null || uri.isBlank()) return null;
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("^/o/[^/]+/t/([^/]+)/api(?:/.*)?$")
                    .matcher(uri);
            if (!m.matches()) return null;
            String teamPublicId = m.group(1);
            List<Long> ids = jdbcTemplate.query(
                    "select id from app_team where public_id = ? order by id limit 1",
                    (rs, rowNum) -> rs.getLong("id"),
                    teamPublicId
            );
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception ignored) {
            return null;
        }
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
                """,
                (rs, rowNum) -> rs.getLong("id"),
                teamId
        );
        if (!ids.isEmpty()) {
            return ids;
        }
        return jdbcTemplate.query("select id from project order by id", (rs, rowNum) -> rs.getLong("id"));
    }

    private List<Long> visibleProjectIdsSafe() {
        try {
            List<Long> ids = visibleProjectIds();
            if (ids != null && !ids.isEmpty()) return ids;
        } catch (Exception ignored) {
        }
        try {
            return jdbcTemplate.query("select id from project order by id", (rs, rowNum) -> rs.getLong("id"));
        } catch (Exception ignored) {
            return List.of(-1L);
        }
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

    private boolean hasColumn(String tableName, String columnName) {
        Integer c = jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.columns
                where table_schema = current_schema()
                  and table_name = ?
                  and column_name = ?
                """,
                Integer.class,
                tableName, columnName
        );
        return c != null && c > 0;
    }

    private boolean hasTable(String tableName) {
        Integer c = jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = current_schema()
                  and table_name = ?
                """,
                Integer.class,
                tableName
        );
        return c != null && c > 0;
    }

    private Map<String, Object> kanbanBoardsFallback(String project) {
        boolean withProjectFilter = project != null && !project.isBlank();
        String visibleProjectsSql = withProjectFilter ? null : inClauseSql(visibleProjectIdsSafe());
        String sql = """
                select b.id, b.name, p.project_type
                from board b
                join project p on p.id = b.project_id
                where 1=1
                """ + (withProjectFilter
                ? " and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?) "
                : " and b.project_id in (" + visibleProjectsSql + ") ")
                + " order by b.id";
        List<Map<String, Object>> boards = withProjectFilter
                ? jdbcTemplate.queryForList(sql, project, project, project)
                : jdbcTemplate.queryForList(sql);
        List<Map<String, Object>> outBoards = new ArrayList<>();
        for (Map<String, Object> b : boards) {
            Long boardId = ((Number) b.get("id")).longValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", boardId);
            row.put("name", b.get("name"));
            String projectType = b.get("project_type") == null ? "kanban" : String.valueOf(b.get("project_type"));
            String boardName = b.get("name") == null ? "" : String.valueOf(b.get("name"));
            row.put("stages", resolveBoardStages(boardId, projectType, boardName));
            row.put("sprintStartedAt", null);
            row.put("sprintFinishedAt", null);
            row.put("tasksSource", "/api/kanban/tasks?boardId=" + boardId + (withProjectFilter ? "&project=" + project : ""));
            row.put("archivedTasks", List.of());
            outBoards.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("boards", outBoards);
        return out;
    }

    private Map<String, Object> kanbanTasksFallback(Long boardId, String project) {
        boolean withProjectFilter = project != null && !project.isBlank();
        String visibleProjectsSql = withProjectFilter ? null : inClauseSql(visibleProjectIdsSafe());
        String sql = """
                select
                    t.id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as public_id,
                    t.board_id,
                    t.name,
                    t.description,
                    t.priority,
                    t.due_date,
                    t.start_date,
                    t.end_date,
                    t.stage,
                    p.name as project_name,
                    p.project_type as project_type,
                    u.full_name as assignee_name,
                    u.avatar_file as assignee_avatar
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                left join app_user u on u.id = t.assignee_id
                where 1=1
                """ + (withProjectFilter
                ? " and (lower(cast(p.code as text)) = lower(?) or lower(cast(p.name as text)) = lower(?) or cast(p.id as text) = ?) "
                : " and b.project_id in (" + visibleProjectsSql + ") ")
                + (boardId != null ? " and t.board_id = ? " : "")
                + " order by t.id";
        List<Map<String, Object>> rows;
        if (withProjectFilter && boardId != null) rows = jdbcTemplate.queryForList(sql, project, project, project, boardId);
        else if (withProjectFilter) rows = jdbcTemplate.queryForList(sql, project, project, project);
        else if (boardId != null) rows = jdbcTemplate.queryForList(sql, boardId);
        else rows = jdbcTemplate.queryForList(sql);
        List<Map<String, Object>> tasks = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id", ((Number) row.get("id")).longValue());
            t.put("displayId", row.get("public_id"));
            t.put("boardId", ((Number) row.get("board_id")).longValue());
            t.put("name", row.get("name"));
            t.put("description", row.get("description"));
            t.put("priority", row.get("priority"));
            t.put("dueDate", toUiDate(row.get("due_date")));
            t.put("startDate", toUiDate(row.get("start_date")));
            t.put("endDate", toUiDate(row.get("end_date")));
            t.put("assignee", row.get("assignee_name"));
            t.put("assigneeAvatar", row.get("assignee_avatar"));
            t.put("stage", row.get("stage"));
            t.put("storyPoints", null);
            t.put("timeEstimateHours", null);
            t.put("project", row.get("project_name"));
            t.put("projectType", row.get("project_type"));
            t.put("archivedDate", null);
            t.put("dependencyTaskId", null);
            t.put("dependencyType", null);
            t.put("dependencyLabel", null);
            t.put("subtasks", List.of());
            tasks.add(t);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", tasks);
        return out;
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
            case "Новая" -> 1;
            case "Очередь" -> 2;
            case "В работе" -> 3;
            case "Тестирование" -> 4;
            case "Готово" -> 5;
            case "Отложено" -> 6;
            default -> 99;
        };
    }

    /**
     * Этапы доски: {@code board_stage}, иначе уникальные стадии из задач, иначе шаблоны сидов.
     */
    private List<String> resolveBoardStages(Long boardId, String projectType, String boardName) {
        boolean hasBoardStageTable = hasTable("board_stage");
        boolean hasTaskItemTable = hasTable("task_item");
        List<String> stages = new ArrayList<>();
        if (hasBoardStageTable) {
            try {
                stages = jdbcTemplate.query(
                        """
                                select bs.stage_name
                                from board_stage bs
                                where bs.board_id = ?
                                order by bs.position
                                """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        boardId);
            } catch (Exception ignored) {
                stages = new ArrayList<>();
            }
        }
        if (stages.isEmpty() && hasTaskItemTable) {
            try {
                stages = jdbcTemplate.query(
                        """
                                select distinct coalesce(nullif(t.stage,''), 'Очередь') as st
                                from task_item t
                                where t.board_id = ?
                                order by st
                                """,
                        (rs, rowNum) -> rs.getString("st"),
                        boardId);
            } catch (Exception ignored) {
                stages = new ArrayList<>();
            }
        }
        stages.sort(Comparator.comparingInt(this::stageOrder).thenComparing(s -> s));
        if (stages.isEmpty()) {
            String pt = projectType == null || projectType.isBlank() ? "kanban" : projectType;
            String bn = boardName == null ? "" : boardName;
            stages = loadDefaultBoardStages(pt, bn);
        }
        return stages;
    }

    /**
     * Этапы доски из seed_board_stage_template (имя доски) или seed_stage_template (тип проекта), иначе дефолт Kanban.
     */
    private List<String> loadDefaultBoardStages(String projectType, String boardName) {
        String pt = projectType == null || projectType.isBlank() ? "kanban" : projectType;
        String bn = boardName == null ? "" : boardName;
        if (hasTable("seed_board_stage_template")) {
            try {
                List<String> fromBoard = jdbcTemplate.query(
                        """
                                select stage_name
                                from seed_board_stage_template
                                where project_type = ?
                                  and board_name = ?
                                order by position_no
                                """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        pt,
                        bn);
                if (!fromBoard.isEmpty()) {
                    return new ArrayList<>(fromBoard);
                }
            } catch (Exception ignored) {
            }
        }
        if (hasTable("seed_stage_template")) {
            try {
                List<String> fromType = jdbcTemplate.query(
                        """
                                select stage_name
                                from seed_stage_template
                                where project_type = ?
                                order by position_no
                                """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        pt);
                if (!fromType.isEmpty()) {
                    return new ArrayList<>(fromType);
                }
            } catch (Exception ignored) {
            }
        }
        return new ArrayList<>(List.of("Очередь", "В работе", "Тестирование", "Готово"));
    }

    private Map<String, Object> activityRow(String key, String value) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("value", value);
        return row;
    }

    private int percent(int part, int total) {
        if (total <= 0) return 0;
        return Math.max(0, Math.min(100, (int) Math.round((part * 100.0) / total)));
    }

    private void saveTaskDependency(Long taskId, Long dependencyTaskId, String dependencyType) {
        if (taskId == null || dependencyTaskId == null || taskId.equals(dependencyTaskId)) return;
        if (dependencyType == null || dependencyType.isBlank()) return;
        switch (dependencyType) {
            case "blocks" -> jdbcTemplate.update(
                    """
                    insert into task_dependency(task_id, depends_on_task_id)
                    values (?, ?)
                    on conflict do nothing
                    """,
                    dependencyTaskId, taskId
            );
            case "blocked_by", "relates" -> jdbcTemplate.update(
                    """
                    insert into task_dependency(task_id, depends_on_task_id)
                    values (?, ?)
                    on conflict do nothing
                    """,
                    taskId, dependencyTaskId
            );
            default -> {
            }
        }
    }

    private String formatEstimateHours(java.math.BigDecimal value) {
        if (value == null) return null;
        return value.stripTrailingZeros().toPlainString();
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
        LocalDate now = LocalDate.now();
        if (d.getYear() == now.getYear()) {
            return String.format("%02d.%02d", d.getDayOfMonth(), d.getMonthValue());
        }
        return d.format(DATE_FMT);
    }

    private String toIsoDateTime(Object tsObj) {
        if (tsObj == null) return null;
        if (tsObj instanceof Timestamp t) return t.toInstant().toString();
        if (tsObj instanceof java.time.OffsetDateTime odt) return odt.toInstant().toString();
        return String.valueOf(tsObj);
    }

    private String currentUsername() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            return "__anonymous__";
        }
        return username;
    }
}
