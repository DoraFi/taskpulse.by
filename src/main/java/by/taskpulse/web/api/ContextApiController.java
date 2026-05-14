package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
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
    public List<Map<String, Object>> projectsAuto(@RequestParam(defaultValue = "team") String scope,
                                                  @RequestParam(defaultValue = "false") boolean archived) {
        return legacy.projects(scope, archived);
    }

    @GetMapping("/api/projects/archived")
    public List<Map<String, Object>> archivedProjectsAuto(@RequestParam(defaultValue = "team") String scope) {
        return legacy.archivedProjects(scope);
    }

    @PostMapping("/api/projects/archive")
    public Map<String, Object> archiveProjectAuto(@RequestBody Map<String, Object> payload) {
        return legacy.archiveProject(payload);
    }

    @PostMapping("/api/projects/restore")
    public Map<String, Object> restoreProjectAuto(@RequestBody Map<String, Object> payload) {
        return legacy.restoreProject(payload);
    }

    @PostMapping("/api/projects/create")
    public Map<String, Object> createProjectAuto(@RequestBody Map<String, Object> payload) {
        return legacy.createProject(payload);
    }

    @GetMapping("/api/task-form/options")
    public Map<String, Object> taskFormOptionsAuto(@RequestParam(required = false) String project,
                                                   @RequestParam(required = false) String q) {
        return legacy.taskFormOptions(project, q);
    }

    @GetMapping("/api/boards")
    public Map<String, Object> boardsAuto(@RequestParam(required = false) String project) {
        return legacy.boards(project);
    }

    @GetMapping("/api/boards/archived")
    public List<Map<String, Object>> archivedBoardsAuto(@RequestParam String projectCode) {
        return legacy.archivedBoards(projectCode);
    }

    @PostMapping("/api/boards/create")
    public Map<String, Object> createBoardAuto(@RequestBody Map<String, Object> payload) {
        return legacy.createBoard(payload);
    }

    @PostMapping("/api/boards/rename")
    public Map<String, Object> renameBoardAuto(@RequestBody Map<String, Object> payload) {
        return legacy.renameBoard(payload);
    }

    @PostMapping("/api/boards/archive")
    public Map<String, Object> archiveBoardAuto(@RequestBody Map<String, Object> payload) {
        return legacy.archiveBoard(payload);
    }

    @PostMapping("/api/boards/restore")
    public Map<String, Object> restoreBoardAuto(@RequestBody Map<String, Object> payload) {
        return legacy.restoreBoard(payload);
    }

    @PostMapping("/api/boards/duplicate")
    public Map<String, Object> duplicateBoardAuto(@RequestBody Map<String, Object> payload) {
        return legacy.duplicateBoard(payload);
    }

    @GetMapping("/api/boards/export")
    public Map<String, Object> exportBoardAuto(@RequestParam Long boardId) {
        return legacy.exportBoard(boardId);
    }

    @PostMapping("/api/boards/stages/add")
    public Map<String, Object> addBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.addBoardStage(payload);
    }

    @PostMapping("/api/boards/stages/rename")
    public Map<String, Object> renameBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.renameBoardStage(payload);
    }

    @PostMapping("/api/boards/stages/move")
    public Map<String, Object> moveBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.moveBoardStage(payload);
    }

    @PostMapping("/api/boards/stages/clear")
    public Map<String, Object> clearBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.clearBoardStage(payload);
    }

    @PostMapping("/api/boards/stages/delete")
    public Map<String, Object> deleteBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.deleteBoardStage(payload);
    }

    @PostMapping("/api/boards/stages/reset")
    public Map<String, Object> resetBoardStageAuto(@RequestBody Map<String, Object> payload) {
        return legacy.resetBoardStages(payload);
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

    @PostMapping("/api/kanban/tasks/attachments/upload")
    public Map<String, Object> uploadTaskAttachmentAuto(@RequestParam Long taskId,
                                                        @RequestParam("file") MultipartFile file) {
        return legacy.uploadTaskAttachment(taskId, file);
    }

    @PostMapping("/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachmentAuto(@RequestParam Long attachmentId) {
        return legacy.deleteTaskAttachment(attachmentId);
    }

    @GetMapping("/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachmentAutoGet(@RequestParam Long attachmentId) {
        return legacy.deleteTaskAttachment(attachmentId);
    }

    @GetMapping("/api/kanban/tasks/attachments")
    public List<Map<String, Object>> taskAttachmentsAuto(@RequestParam Long taskId) {
        return legacy.taskAttachments(taskId);
    }

    @PostMapping("/api/kanban/subtasks/toggle")
    public Map<String, Object> toggleSubtaskAuto(@RequestBody Map<String, Object> payload) {
        return legacy.toggleSubtask(payload);
    }

    @PostMapping("/api/scrum/sprints/start")
    public Map<String, Object> scrumSprintStartAuto(@RequestBody Map<String, Object> payload) {
        return legacy.startSprint(payload);
    }

    @PostMapping("/api/scrum/sprints/finish")
    public Map<String, Object> scrumSprintFinishAuto(@RequestBody Map<String, Object> payload) {
        return legacy.finishSprint(payload);
    }

    @PostMapping("/api/scrum/boards/consolidate")
    public Map<String, Object> scrumBoardsConsolidateAuto(@RequestBody Map<String, Object> payload) {
        return legacy.consolidateScrumBoards(payload);
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
    public Map<String, Object> indexSummaryAuto(HttpServletResponse response) {
        return legacy.indexSummary(response);
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
    public List<Map<String, Object>> projects(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestParam(defaultValue = "team") String scope,
                                              @RequestParam(defaultValue = "false") boolean archived) {
        ensureContextAccess(orgId, teamId);
        return legacy.projects(scope, archived);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/projects/archived")
    public List<Map<String, Object>> archivedProjects(@PathVariable String orgId,
                                                      @PathVariable String teamId,
                                                      @RequestParam(defaultValue = "team") String scope) {
        ensureContextAccess(orgId, teamId);
        return legacy.archivedProjects(scope);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/projects/archive")
    public Map<String, Object> archiveProject(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.archiveProject(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/projects/restore")
    public Map<String, Object> restoreProject(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.restoreProject(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/projects/create")
    public Map<String, Object> createProject(@PathVariable String orgId,
                                             @PathVariable String teamId,
                                             @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.createProject(payload);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/task-form/options")
    public Map<String, Object> taskFormOptions(@PathVariable String orgId,
                                               @PathVariable String teamId,
                                               @RequestParam(required = false) String project,
                                               @RequestParam(required = false) String q) {
        ensureContextAccess(orgId, teamId);
        return legacy.taskFormOptions(project, q);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/boards")
    public Map<String, Object> boards(@PathVariable String orgId,
                                      @PathVariable String teamId,
                                      @RequestParam(required = false) String project) {
        ensureContextAccess(orgId, teamId);
        return legacy.boards(project);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/boards/archived")
    public List<Map<String, Object>> archivedBoards(@PathVariable String orgId,
                                                    @PathVariable String teamId,
                                                    @RequestParam String projectCode) {
        ensureContextAccess(orgId, teamId);
        return legacy.archivedBoards(projectCode);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/create")
    public Map<String, Object> createBoard(@PathVariable String orgId,
                                           @PathVariable String teamId,
                                           @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.createBoard(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/rename")
    public Map<String, Object> renameBoard(@PathVariable String orgId,
                                           @PathVariable String teamId,
                                           @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.renameBoard(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/archive")
    public Map<String, Object> archiveBoard(@PathVariable String orgId,
                                            @PathVariable String teamId,
                                            @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.archiveBoard(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/restore")
    public Map<String, Object> restoreBoard(@PathVariable String orgId,
                                            @PathVariable String teamId,
                                            @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.restoreBoard(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/duplicate")
    public Map<String, Object> duplicateBoard(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.duplicateBoard(payload);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/boards/export")
    public Map<String, Object> exportBoard(@PathVariable String orgId,
                                           @PathVariable String teamId,
                                           @RequestParam Long boardId) {
        ensureContextAccess(orgId, teamId);
        return legacy.exportBoard(boardId);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/add")
    public Map<String, Object> addBoardStage(@PathVariable String orgId,
                                             @PathVariable String teamId,
                                             @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.addBoardStage(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/rename")
    public Map<String, Object> renameBoardStage(@PathVariable String orgId,
                                                @PathVariable String teamId,
                                                @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.renameBoardStage(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/move")
    public Map<String, Object> moveBoardStage(@PathVariable String orgId,
                                              @PathVariable String teamId,
                                              @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.moveBoardStage(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/clear")
    public Map<String, Object> clearBoardStage(@PathVariable String orgId,
                                               @PathVariable String teamId,
                                               @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.clearBoardStage(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/delete")
    public Map<String, Object> deleteBoardStage(@PathVariable String orgId,
                                                @PathVariable String teamId,
                                                @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.deleteBoardStage(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/boards/stages/reset")
    public Map<String, Object> resetBoardStage(@PathVariable String orgId,
                                               @PathVariable String teamId,
                                               @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.resetBoardStages(payload);
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

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/attachments/upload")
    public Map<String, Object> uploadTaskAttachment(@PathVariable String orgId,
                                                    @PathVariable String teamId,
                                                    @RequestParam Long taskId,
                                                    @RequestParam("file") MultipartFile file) {
        ensureContextAccess(orgId, teamId);
        return legacy.uploadTaskAttachment(taskId, file);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachment(@PathVariable String orgId,
                                                    @PathVariable String teamId,
                                                    @RequestParam Long attachmentId) {
        ensureContextAccess(orgId, teamId);
        return legacy.deleteTaskAttachment(attachmentId);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/attachments/delete")
    public Map<String, Object> deleteTaskAttachmentGet(@PathVariable String orgId,
                                                       @PathVariable String teamId,
                                                       @RequestParam Long attachmentId) {
        ensureContextAccess(orgId, teamId);
        return legacy.deleteTaskAttachment(attachmentId);
    }

    @GetMapping("/o/{orgId}/t/{teamId}/api/kanban/tasks/attachments")
    public List<Map<String, Object>> taskAttachments(@PathVariable String orgId,
                                                     @PathVariable String teamId,
                                                     @RequestParam Long taskId) {
        ensureContextAccess(orgId, teamId);
        return legacy.taskAttachments(taskId);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/kanban/subtasks/toggle")
    public Map<String, Object> toggleSubtask(@PathVariable String orgId,
                                             @PathVariable String teamId,
                                             @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.toggleSubtask(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/scrum/sprints/start")
    public Map<String, Object> scrumSprintStart(@PathVariable String orgId,
                                               @PathVariable String teamId,
                                               @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.startSprint(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/scrum/sprints/finish")
    public Map<String, Object> scrumSprintFinish(@PathVariable String orgId,
                                                @PathVariable String teamId,
                                                @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.finishSprint(payload);
    }

    @PostMapping("/o/{orgId}/t/{teamId}/api/scrum/boards/consolidate")
    public Map<String, Object> scrumBoardsConsolidate(@PathVariable String orgId,
                                                      @PathVariable String teamId,
                                                      @RequestBody Map<String, Object> payload) {
        ensureContextAccess(orgId, teamId);
        return legacy.consolidateScrumBoards(payload);
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
    public Map<String, Object> indexSummary(@PathVariable String orgId, @PathVariable String teamId, HttpServletResponse response) {
        ensureContextAccess(orgId, teamId);
        return legacy.indexSummary(response);
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
        String myOrg = String.valueOf(row.get("org_public_id")).trim();
        String myTeam = String.valueOf(row.get("team_public_id")).trim();
        if (!myOrg.equals(orgId.trim()) || !myTeam.equals(teamId.trim())) {
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
