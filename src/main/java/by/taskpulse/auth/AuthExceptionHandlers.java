package by.taskpulse.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
public class AuthExceptionHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {
    private static final String AUTH_COOKIE = "TP_AUTH";
    private static final String SESSION_EXPIRED_JSON =
            "{\"error\":\"session_expired\",\"message\":\"Сессия истекла. Войдите снова.\"}";

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException)
            throws IOException {
        respondUnauthenticated(request, response);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException accessDeniedException)
            throws IOException {
        respondUnauthenticated(request, response);
    }

    private void respondUnauthenticated(HttpServletRequest request, HttpServletResponse response) throws IOException {
        clearAuthCookie(response);
        if (wantsJsonResponse(request)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(SESSION_EXPIRED_JSON);
            return;
        }
        String target = request.getContextPath() + "/auth/login?session=expired";
        String redirect = safeReturnPath(request.getParameter("redirect"));
        if (redirect == null) {
            redirect = safeReturnPath(buildReturnPath(request));
        }
        if (redirect != null) {
            target += "&redirect=" + java.net.URLEncoder.encode(redirect, StandardCharsets.UTF_8);
        }
        response.sendRedirect(target);
    }

    private static String buildReturnPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String qs = request.getQueryString();
        if (qs != null && !qs.isBlank()) {
            return uri + "?" + qs;
        }
        return uri;
    }

    private static String safeReturnPath(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/auth/")) {
            return null;
        }
        return path;
    }

    static boolean wantsJsonResponse(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri.startsWith("/api/") || uri.contains("/api/")) {
            return true;
        }
        if (uri.startsWith("/templates/")) {
            return true;
        }
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains(MediaType.APPLICATION_JSON_VALUE)) {
            return true;
        }
        return "XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"));
    }

    static void clearAuthCookie(HttpServletResponse response) {
        jakarta.servlet.http.Cookie cookie = new jakarta.servlet.http.Cookie(AUTH_COOKIE, "");
        cookie.setPath("/");
        cookie.setMaxAge(0);
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
    }
}
