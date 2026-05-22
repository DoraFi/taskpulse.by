package by.taskpulse.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Controller
public class TeamPageController {
    private final ContextPageGate contextPageGate;

    public TeamPageController(ContextPageGate contextPageGate) {
        this.contextPageGate = contextPageGate;
    }

    @GetMapping("/o/{orgId}/t/{teamId}/team")
    public String teamPage(@PathVariable String orgId,
                           @PathVariable String teamId,
                           HttpServletRequest request,
                           Model model) {
        String blocked = contextPageGate.openContextPage(orgId, teamId, request, model);
        if (blocked != null) {
            return blocked;
        }
        return "pages/team";
    }

    @GetMapping("/templates/pages/team.html")
    public String teamTemplatePage() {
        return "pages/team";
    }
}
