package by.taskpulse.web;

import by.taskpulse.auth.CurrentUserProvider;
import java.util.Map;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.ui.Model;

@Controller
public class PageController {
    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;

    public PageController(JdbcTemplate jdbcTemplate, CurrentUserProvider currentUserProvider) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/")
    public String root() {
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
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
            String orgId = String.valueOf(row.get("org_public_id"));
            String teamId = String.valueOf(row.get("team_public_id"));
            if (!orgId.isBlank() && !teamId.isBlank()) {
                return "redirect:/o/" + orgId + "/t/" + teamId;
            }
        } catch (Exception ignored) {}
        return "redirect:/auth/welcome";
    }

    @GetMapping({"/auth/welcome", "/templates/pages/auth_welcome.html"})
    public String authWelcome() {
        return "pages/auth_welcome";
    }

    @GetMapping({"/auth/login", "/templates/pages/auth_login.html"})
    public String authLogin() {
        return "pages/auth_login";
    }

    @GetMapping({"/auth/register", "/templates/pages/auth_register.html"})
    public String authRegister() {
        return "pages/auth_register";
    }

    @GetMapping({"/auth/forgot", "/templates/pages/auth_forgot.html"})
    public String authForgot() {
        return "pages/auth_forgot";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/p/{projectCode}/boards")
    public String boardsListContext(@PathVariable String orgId,
                                    @PathVariable String teamId,
                                    @PathVariable String projectCode,
                                    @RequestParam(required = false) String project,
                                    HttpServletRequest request,
                                    Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        if (project != null && !project.isBlank() && !projectCode.equalsIgnoreCase(project)) {
            return contextErrorView(model, request, 400, "Параметр project не совпадает с projectCode в пути");
        }
        String projectError = validateProjectAccess(orgId, teamId, projectCode, "list");
        if (projectError != null) return contextErrorView(model, request, 404, projectError);
        return "pages/board_list";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/p/{projectCode}/kanban")
    public String boardKanbanContext(@PathVariable String orgId,
                                     @PathVariable String teamId,
                                     @PathVariable String projectCode,
                                     @RequestParam(required = false) String project,
                                     HttpServletRequest request,
                                     Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        if (project != null && !project.isBlank() && !projectCode.equalsIgnoreCase(project)) {
            return contextErrorView(model, request, 400, "Параметр project не совпадает с projectCode в пути");
        }
        String projectError = validateProjectAccess(orgId, teamId, projectCode, "kanban");
        if (projectError != null) return contextErrorView(model, request, 404, projectError);
        return "pages/board_kanban";
    }

    @GetMapping("/o/{orgId}/t/{teamId}")
    public String homeContext(@PathVariable String orgId, @PathVariable String teamId, HttpServletRequest request, Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return "pages/index";
    }

    @GetMapping("/o/{orgId}")
    public String incompleteOrgContext(@PathVariable String orgId, HttpServletRequest request, Model model) {
        if (!isValidUuid(orgId)) {
            return contextErrorView(model, request, 404, "Ссылка выглядит поврежденной. Проверьте, что вы открыли ее полностью.");
        }
        return contextErrorView(model, request, 404, "Ссылка неполная: в ней не указана команда.");
    }

    @GetMapping("/o/{orgId}/t")
    public String incompleteTeamPrefix(@PathVariable String orgId, HttpServletRequest request, Model model) {
        if (!isValidUuid(orgId)) {
            return contextErrorView(model, request, 404, "Ссылка выглядит поврежденной. Проверьте, что вы открыли ее полностью.");
        }
        return contextErrorView(model, request, 404, "Ссылка неполная: после /t отсутствует идентификатор команды.");
    }

    @GetMapping("/o/{orgId}/t/{teamId}/index")
    public String homeContextIndex(@PathVariable String orgId, @PathVariable String teamId, HttpServletRequest request, Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return "pages/index";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/tasks")
    public String tasksTeamContext(@PathVariable String orgId, @PathVariable String teamId, HttpServletRequest request, Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return "pages/tasks";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/p/{projectCode}/tasks")
    public String tasksProjectContext(@PathVariable String orgId,
                                      @PathVariable String teamId,
                                      @PathVariable String projectCode,
                                      HttpServletRequest request,
                                      Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        String projectError = validateProjectAccess(orgId, teamId, projectCode, null);
        if (projectError != null) return contextErrorView(model, request, 404, projectError);
        return "pages/tasks";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/tasks/all")
    public String tasksAllContext(@PathVariable String orgId, @PathVariable String teamId, HttpServletRequest request, Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return "pages/tasks";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/projects")
    public String projectsContext(@PathVariable String orgId, @PathVariable String teamId, HttpServletRequest request, Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return "pages/projects";
    }

    @GetMapping("/o/{orgId}/t/{teamId}/{*rest}")
    public String invalidContextSubpath(@PathVariable String orgId,
                                        @PathVariable String teamId,
                                        HttpServletRequest request,
                                        Model model) {
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) return contextErrorView(model, request, 404, contextError);
        return contextErrorView(model, request, 404, "Страница в этом контексте не найдена");
    }

    @GetMapping({"/onboarding/project", "/templates/pages/onboarding_project.html"})
    public String onboardingProject() {
        return "pages/onboarding_project";
    }

    @GetMapping({"/onboarding/org-team", "/templates/pages/onboarding_org_team.html"})
    public String onboardingOrgTeam() {
        return "pages/onboarding_org_team";
    }

    @GetMapping({"/onboarding/team", "/templates/pages/onboarding_team.html"})
    public String onboardingTeam() {
        return "pages/onboarding_team";
    }

    @GetMapping({"/onboarding/done", "/templates/pages/onboarding_done.html"})
    public String onboardingDone() {
        return "pages/onboarding_done";
    }

    @GetMapping("/templates/components/aside.html")
    public String asideComponent() {
        return "components/aside";
    }

    @GetMapping("/templates/components/header.html")
    public String headerComponent() {
        return "components/header";
    }

    @GetMapping("/templates/components/profile_modal.html")
    public String profileModalComponent() {
        return "components/profile_modal";
    }

    @GetMapping("/templates/components/settings_modal.html")
    public String settingsModalComponent() {
        return "components/settings_modal";
    }

    @GetMapping("/templates/components/create_task_modal.html")
    public String createTaskModalComponent() {
        return "components/create_task_modal";
    }

    private String validateContextAccess(String orgId, String teamId) {
        if (!isValidUuid(orgId) || !isValidUuid(teamId)) {
            return "Ссылка выглядит поврежденной. Проверьте, что вы открыли ее полностью.";
        }
        Integer teamExists = jdbcTemplate.queryForObject(
                """
                select count(*)
                from app_team t
                join organization org on org.id = t.organization_id
                where org.public_id = ? and t.public_id = ?
                """,
                Integer.class,
                orgId, teamId
        );
        if (teamExists == null || teamExists == 0) {
            return "Мы не нашли эту команду. Возможно, ссылка устарела или содержит опечатку.";
        }
        Integer hasAccess = jdbcTemplate.queryForObject(
                """
                select count(*)
                from app_user u
                join team_membership tm on tm.user_id = u.id
                join app_team t on t.id = tm.team_id
                join organization org on org.id = t.organization_id
                where u.username = ?
                  and org.public_id = ?
                  and t.public_id = ?
                """,
                Integer.class,
                currentUsername(), orgId, teamId
        );
        if (hasAccess == null || hasAccess == 0) {
            return "У вас пока нет доступа к этой команде.";
        }
        return null;
    }

    private String validateProjectAccess(String orgId, String teamId, String projectCode, String expectedType) {
        String sql = """
                select count(*)
                from project p
                join project_team pt on pt.project_id = p.id
                join app_team t on t.id = pt.team_id
                join organization org on org.id = t.organization_id
                where org.public_id = ?
                  and t.public_id = ?
                  and p.code = ?
                """ + (expectedType != null ? " and p.project_type = ? " : "");
        Integer count = expectedType != null
                ? jdbcTemplate.queryForObject(sql, Integer.class, orgId, teamId, projectCode, expectedType)
                : jdbcTemplate.queryForObject(sql, Integer.class, orgId, teamId, projectCode);
        if (count == null || count == 0) {
            return "Проект по этой ссылке не найден.";
        }
        return null;
    }

    private boolean isValidUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String contextErrorView(Model model, HttpServletRequest request, int status, String message) {
        model.addAttribute("status", status);
        model.addAttribute("path", request.getRequestURI() + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
        model.addAttribute("message", message);
        model.addAttribute("title", status == 400 ? "Не удалось открыть страницу" : "Страница недоступна");
        model.addAttribute("hint", "Проверьте ссылку или перейдите на рабочую страницу через меню.");
        return "error";
    }

    private String currentUsername() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            return "__anonymous__";
        }
        return username;
    }
}
