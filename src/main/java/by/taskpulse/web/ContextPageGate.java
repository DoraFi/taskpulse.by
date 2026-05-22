package by.taskpulse.web;

import by.taskpulse.auth.CurrentUserProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.ui.Model;

@Component
public class ContextPageGate {
    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;

    public ContextPageGate(JdbcTemplate jdbcTemplate, CurrentUserProvider currentUserProvider) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
    }

    public String openContextPage(String orgId, String teamId, HttpServletRequest request, Model model) {
        String redirect = buildCanonicalContextRedirect(orgId, teamId, request);
        if (redirect != null) {
            return redirect;
        }
        String contextError = validateContextAccess(orgId, teamId);
        if (contextError != null) {
            return contextErrorView(model, request, 404, contextError);
        }
        return null;
    }

    public String contextErrorView(Model model, HttpServletRequest request, int status, String message) {
        model.addAttribute("status", status);
        model.addAttribute("path", request.getRequestURI()
                + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
        model.addAttribute("message", message);
        model.addAttribute("title", status == 400 ? "Не удалось открыть страницу" : "Страница недоступна");
        model.addAttribute("hint", "Проверьте ссылку или перейдите на рабочую страницу через меню.");
        return "error";
    }

    private String buildCanonicalContextRedirect(String orgId, String teamId, HttpServletRequest request) {
        if (!isValidUuid(teamId)) {
            return null;
        }
        var resolved = TeamContextSupport.resolveByTeamPublicId(jdbcTemplate, teamId);
        if (resolved.isEmpty()) {
            return null;
        }
        String canonicalOrg = resolved.get().get("org_public_id");
        if (canonicalOrg.equalsIgnoreCase(orgId.trim())) {
            return null;
        }
        String uri = request.getRequestURI();
        String fixed = uri.replaceFirst("/o/[^/]+/t/", "/o/" + canonicalOrg + "/t/");
        if (fixed.equals(uri)) {
            return null;
        }
        String qs = request.getQueryString();
        return "redirect:" + fixed + (qs != null && !qs.isBlank() ? "?" + qs : "");
    }

    private String validateContextAccess(String orgId, String teamId) {
        if (!isValidUuid(teamId)) {
            return "Ссылка выглядит поврежденной. Проверьте, что вы открыли её полностью.";
        }
        var resolved = TeamContextSupport.resolveByTeamPublicId(jdbcTemplate, teamId);
        if (resolved.isEmpty()) {
            return "Мы не нашли эту команду. Возможно, ссылка устарела или содержит опечатку.";
        }
        if (!TeamContextSupport.userCanAccessTeam(jdbcTemplate, currentUsername(), teamId)) {
            return "У вас пока нет доступа к этой команде.";
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

    private String currentUsername() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            return "__anonymous__";
        }
        return username;
    }
}
