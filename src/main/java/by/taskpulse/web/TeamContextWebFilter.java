package by.taskpulse.web;

import java.io.IOException;
import java.util.Optional;
import java.util.Map;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class TeamContextWebFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                  HttpServletResponse response,
                                  FilterChain filterChain) throws ServletException, IOException {
        try {
            bindTeamFromRequest(request);
            filterChain.doFilter(request, response);
        } finally {
            TeamContextHolder.clear();
        }
    }

    private void bindTeamFromRequest(HttpServletRequest request) {
        @SuppressWarnings("unchecked")
        Map<String, String> pathVars = (Map<String, String>) request.getAttribute(
                HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (pathVars != null) {
            String teamId = pathVars.get("teamId");
            if (teamId != null && !teamId.isBlank()) {
                TeamContextHolder.setTeamPublicId(teamId);
                return;
            }
        }
        Optional<Map<String, String>> fromUri = TeamContextSupport.parseContextFromUrl(request.getRequestURI());
        if (fromUri.isPresent()) {
            TeamContextHolder.setTeamPublicId(fromUri.get().get("team_public_id"));
            return;
        }
        String referer = request.getHeader("Referer");
        TeamContextSupport.parseContextFromUrl(referer)
                .ifPresent(ctx -> TeamContextHolder.setTeamPublicId(ctx.get("team_public_id")));
    }
}
