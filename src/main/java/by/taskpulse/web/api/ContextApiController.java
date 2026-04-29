package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ContextApiController {

    private final JdbcTemplate jdbcTemplate;
    private final LegacyDataApiController legacy;
    private final CurrentUserProvider currentUserProvider;

    public ContextApiController(JdbcTemplate jdbcTemplate, LegacyDataApiController legacy, CurrentUserProvider currentUserProvider) {
        this.jdbcTemplate = jdbcTemplate;
        this.legacy = legacy;
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/api/me")
    public Map<String, Object> meAuto() {
        return legacy.me();
    }

    @GetMapping("/api/team")
    public List<Map<String, Object>> teamAuto() {
        return legacy.team();
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> projectsAuto() {
        return legacy.projects();
    }

    @GetMapping("/api/boards")
    public Map<String, Object> boardsAuto(@RequestParam(required = false) String project) {
        return legacy.boards(project);
    }

    @GetMapping("/api/kanban/boards")
    public Map<String, Object> kanbanBoardsAuto(@RequestParam(required = false) String project) {
        return legacy.kanbanBoards(project);
    }

    @GetMapping("/api/kanban/tasks")
    public Map<String, Object> kanbanTasksAuto(@RequestParam(required = false) Long boardId,
                                               @RequestParam(required = false) String project) {
        return legacy.kanbanTasks(boardId, project);
    }

    @PostMapping("/api/kanban/tasks/move")
    public Map<String, Object> moveTaskAuto(@RequestBody Map<String, Object> payload) {
        return legacy.moveKanbanTask(payload);
    }

    @PostMapping("/api/kanban/tasks/create")
    public Map<String, Object> createKanbanTaskAuto(@RequestBody Map<String, Object> payload) {
        return legacy.createKanbanTask(payload);
    }

    @PostMapping("/api/kanban/tasks/update")
    public Map<String, Object> updateKanbanTaskAuto(@RequestBody Map<String, Object> payload) {
        return legacy.updateKanbanTask(payload);
    }

    @PostMapping("/api/kanban/subtasks/toggle")
    public Map<String, Object> toggleSubtaskAuto(@RequestBody Map<String, Object> payload) {
        return legacy.toggleSubtask(payload);
    }

    @GetMapping("/api/tasks")
    public List<Map<String, Object>> tasksAuto() {
        return legacy.tasksTable();
    }

    @GetMapping("/api/tasks/assigned")
    public List<Map<String, Object>> tasksAssignedAuto() {
        return legacy.assignedTasks();
    }

    @GetMapping("/api/index/summary")
    public Map<String, Object> indexSummaryAuto() {
        return legacy.indexSummary();
    }

    @GetMapping("/api/index/mini-chart")
    public Map<String, Object> miniChartAuto() {
        return legacy.miniChart();
    }

    @GetMapping("/api/reports/projects")
    public Map<String, Object> reportsAuto(@RequestParam(defaultValue = "all") String mode) {
        return legacy.projectReports(mode);
    }

    @GetMapping("/api/bootstrap/context")
    public Map<String, Object> bootstrapContext() {
        Map<String, Object> row = currentContextRow();
        String orgId = String.valueOf(row.get("org_public_id"));
        String teamId = String.valueOf(row.get("team_public_id"));
        return Map.of(
                "organizationPublicId", orgId,
                "teamPublicId", teamId,
                "basePath", "/o/" + orgId + "/t/" + teamId
        );
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/me")
    public Map<String, Object> me(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.me();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/team")
    public List<Map<String, Object>> team(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.team();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/projects")
    public List<Map<String, Object>> projects(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.projects();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/boards")
    public Map<String, Object> boards(@PathVariable String orgId,
                                      @PathVariable String teamId,
                                      @RequestParam(required = false) String project) {
        ensureContextAccess(orgId, teamId);
        return legacy.boards(project);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/kanban/boards")
    public Map<String, Object> kanbanBoards(@PathVariable String orgId,
                                            @PathVariable String teamId,
                                            @RequestParam(required = false) String project) {
        ensureContextAccess(orgId, teamId);
        return legacy.kanbanBoards(project);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks")
    public Map<String, Object> kanbanTasks(@PathVariable String orgId,
                                           @PathVariable String teamId,
                                           @RequestParam(required = false) Long boardId,
                                           @RequestParam(required = false) String project) {
        ensureContextAccess(orgId, teamId);
        return legacy.kanbanTasks(boardId, project);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/move")
    public Map<String, Object> moveKanbanTask(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.moveKanbanTask(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/create")
    public Map<String, Object> createKanbanTask(@PathVariable String orgId,
                                                @PathVariable String teamId,
                                                @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.createKanbanTask(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/update")
    public Map<String, Object> updateKanbanTask(@PathVariable String orgId,
                                                @PathVariable String teamId,
                                                @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.updateKanbanTask(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/subtasks/toggle")
    public Map<String, Object> toggleSubtask(@PathVariable String orgId,
                                             @PathVariable String teamId,
                                             @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.toggleSubtask(payload);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/tasks")
    public List<Map<String, Object>> tasks(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.tasksTable();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/tasks/assigned")
    public List<Map<String, Object>> assigned(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.assignedTasks();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/index/summary")
    public Map<String, Object> indexSummary(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.indexSummary();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/index/mini-chart")
    public Map<String, Object> miniChart(@PathVariable String orgId, @PathVariable String teamId) {
        ensureContextAccess(orgId, teamId);
        return legacy.miniChart();
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/reports/projects")
    public Map<String, Object> reports(@PathVariable String orgId,
                                       @PathVariable String teamId,
                                       @RequestParam(defaultValue = "all") String mode) {
        ensureContextAccess(orgId, teamId);
        return legacy.projectReports(mode);
    }

    private void ensureContextAccess(String orgId, String teamId) {
        Map<String, Object> row = currentContextRow();
        String myOrg = String.valueOf(row.get("org_public_id"));
        String myTeam = String.valueOf(row.get("team_public_id"));
        if (!myOrg.equals(orgId) || !myTeam.equals(teamId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к указанной организации/команде");
        }
    }

    private Map<String, Object> currentContextRow() {
        return jdbcTemplate.queryForMap(
                """
                select
                    coalesce(org.public_id, '') as org_public_id,
                    coalesce(t.public_id, '') as team_public_id
                from app_user u
                join team_membership tm on tm.user_id = u.id
                join app_team t on t.id = tm.team_id
                join organization org on org.id = t.organization_id
                where u.username = ?
                order by t.id
                limit 1
                """,
                currentUsername()
        );
    }

    private String currentUsername() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется авторизация");
        }
        return username;
    }
}
