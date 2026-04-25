package by.taskpulse.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping({"/", "/templates/pages/index.html"})
    public String home() {
        return "pages/index";
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

    @GetMapping({"/boards", "/templates/pages/board_list.html"})
    public String boardsList() {
        return "pages/board_list";
    }

    @GetMapping({"/kanban", "/templates/pages/board_kanban.html"})
    public String boardKanban() {
        return "pages/board_kanban";
    }

    @GetMapping({"/tasks", "/templates/pages/tasks.html"})
    public String tasks() {
        return "pages/tasks";
    }

    @GetMapping({"/projects", "/templates/pages/projects.html"})
    public String projects() {
        return "pages/projects";
    }

    @GetMapping({"/onboarding/project", "/templates/pages/onboarding_project.html"})
    public String onboardingProject() {
        return "pages/onboarding_project";
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
}
