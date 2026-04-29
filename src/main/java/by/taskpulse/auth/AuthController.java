package by.taskpulse.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Validated
public class AuthController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String AUTH_COOKIE = "TP_AUTH";
    private static final String EMAIL_REGEX_STRICT = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;

    public AuthController(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder, JwtService jwtService, JwtProperties jwtProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (exists("select count(*) from app_user where email = ?", email)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Пользователь с таким email уже существует"));
        }
        String username = nextUniqueUsername(email);
        String orgId = nextOrganizationCode(req.organizationName());
        String teamCode = nextTeamCode(orgId);
        String projectCodeInput = req.projectKey() == null ? "" : req.projectKey().trim();
        if (!projectCodeInput.isBlank() && !projectCodeInput.matches("^[A-Za-z]{3}$")) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Ключ проекта должен состоять из 3 латинских букв."));
        }
        String projectCode = projectCodeInput.isBlank()
                ? nextProjectCodeFromName(orgId, req.projectName())
                : projectCodeInput.toUpperCase(Locale.ROOT);
        String projectType = normalizeProjectType(req.projectType());

        jdbcTemplate.update("insert into organization(id, name) values (?, ?)", orgId, req.organizationName().trim());

        jdbcTemplate.update(
                """
                insert into app_user(email, full_name, password_hash, organization_id, username, is_active)
                values (?, ?, ?, ?, ?, true)
                """,
                email, req.fullName().trim(), passwordEncoder.encode(req.password()), orgId, username
        );
        Long userId = jdbcTemplate.queryForObject("select id from app_user where email = ?", Long.class, email);

        jdbcTemplate.update(
                """
                insert into app_team(organization_id, code, name, lead_user_id)
                values (?, ?, ?, ?)
                """,
                orgId, teamCode, req.teamName().trim(), userId
        );
        Long teamId = jdbcTemplate.queryForObject(
                "select id from app_team where organization_id = ? and code = ?",
                Long.class,
                orgId, teamCode
        );

        jdbcTemplate.update("insert into team_membership(team_id, user_id, role) values (?, ?, 'lead')", teamId, userId);

        jdbcTemplate.update(
                """
                insert into project(name, owner_id, organization_id, code, summary, project_type)
                values (?, ?, ?, ?, ?, ?)
                """,
                req.projectName().trim(), userId, orgId, projectCode, "", projectType
        );
        Long projectId = jdbcTemplate.queryForObject(
                "select id from project where organization_id = ? and code = ?",
                Long.class,
                orgId, projectCode
        );
        jdbcTemplate.update("insert into project_team(project_id, team_id) values (?, ?)", projectId, teamId);
        jdbcTemplate.update("insert into project_member(project_id, user_id, role) values (?, ?, 'owner')", projectId, userId);

        jdbcTemplate.update(
                "insert into app_user_role(user_id, role_code, organization_id) values (?, 'organization_registrar', ?)",
                userId, orgId
        );
        jdbcTemplate.update(
                "insert into app_user_role(user_id, role_code, organization_id, team_id) values (?, 'team_admin', ?, ?)",
                userId, orgId, teamId
        );
        jdbcTemplate.update(
                "insert into app_user_role(user_id, role_code, organization_id, team_id, project_id) values (?, 'project_admin', ?, ?, ?)",
                userId, orgId, teamId, projectId
        );

        // Для нового проекта сразу создаём базовый набор досок и этапов.
        // Это нужно, чтобы пользователь мог продолжить работу в интерфейсе даже на "пустом" проекте.
        createDefaultBoardsAndStages(projectId, projectCode, projectType);

        List<Map<String, Object>> inviteResult = new ArrayList<>();
        for (InviteRequest invite : req.invites()) {
            String inviteRole = normalizeInviteRole(invite.role());
            String invitedEmail = invite.email().trim().toLowerCase(Locale.ROOT);
            jdbcTemplate.update(
                    """
                    insert into team_invitation(organization_id, team_id, invited_email, invited_role, status, invited_by)
                    values (?, ?, ?, ?, 'sent', ?)
                    """,
                    orgId, teamId, invitedEmail, inviteRole, userId
            );
            inviteResult.add(Map.of("email", invitedEmail, "role", inviteRole, "status", "sent"));
        }

        Map<String, Object> context = contextByUserId(userId);
        String token = jwtService.generateToken(username, userId, List.of("organization_registrar", "team_admin", "project_admin"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("userId", userId);
        body.put("username", username);
        body.put("email", email);
        body.put("context", context);
        body.put("invites", inviteResult);
        return withAuthCookie(token, body);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "select id, username, password_hash from app_user where email = ? and is_active = true",
                email
        );
        if (users.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Неверный email или пароль"));
        }
        Map<String, Object> user = users.get(0);
        String hash = String.valueOf(user.get("password_hash"));
        if (!passwordEncoder.matches(req.password(), hash)) {
            return ResponseEntity.status(401).body(Map.of("error", "Неверный email или пароль"));
        }
        Long userId = ((Number) user.get("id")).longValue();
        String username = String.valueOf(user.get("username"));
        List<String> roles = jdbcTemplate.query(
                "select role_code from app_user_role where user_id = ?",
                (rs, rowNum) -> rs.getString("role_code"),
                userId
        );
        if (roles.isEmpty()) roles = List.of("member");

        String token = jwtService.generateToken(username, userId, roles);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("userId", userId);
        body.put("username", username);
        body.put("context", contextByUserId(userId));
        body.put("roles", roles);
        return withAuthCookie(token, body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout() {
        ResponseCookie cookie = ResponseCookie.from(AUTH_COOKIE, "")
                .path("/")
                .httpOnly(true)
                .sameSite("Lax")
                .maxAge(Duration.ZERO)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(Map.of("ok", true));
    }

    private ResponseEntity<Map<String, Object>> withAuthCookie(String token, Map<String, Object> body) {
        ResponseCookie cookie = ResponseCookie.from(AUTH_COOKIE, token)
                .path("/")
                .httpOnly(true)
                .sameSite("Lax")
                .maxAge(Duration.ofMinutes(jwtProperties.getExpirationMinutes()))
                .build();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(body);
    }

    private boolean exists(String sql, Object... args) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, args);
        return count != null && count > 0;
    }

    private String normalizeProjectType(String raw) {
        if (raw == null) return "kanban";
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "list", "kanban", "scrum", "scrumban" -> value;
            default -> "kanban";
        };
    }

    private String normalizeInviteRole(String raw) {
        if (raw == null) return "member";
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "team_admin", "member", "observer" -> value;
            default -> "member";
        };
    }

    private String nextUniqueUsername(String email) {
        String local = email.split("@")[0].replaceAll("[^a-zA-Z0-9._-]", "").toLowerCase(Locale.ROOT);
        if (local.isBlank()) local = "user";
        String candidate = local;
        int n = 1;
        while (exists("select count(*) from app_user where username = ?", candidate)) {
            candidate = local + n++;
        }
        return candidate;
    }

    private String nextOrganizationCode(String orgName) {
        String base = orgName.replaceAll("[^A-Za-z]", "").toUpperCase(Locale.ROOT);
        if (base.length() < 3) base = base + randomLetters(3 - base.length());
        base = base.substring(0, 3);
        String candidate = base;
        while (exists("select count(*) from organization where id = ?", candidate)) {
            candidate = randomLetters(3);
        }
        return candidate;
    }

    private String nextTeamCode(String orgId) {
        String candidate = randomLetters(3);
        while (exists("select count(*) from app_team where organization_id = ? and code = ?", orgId, candidate)) {
            candidate = randomLetters(3);
        }
        return candidate;
    }

    private void createDefaultBoardsAndStages(Long projectId, String projectCode, String projectType) {
        // Реализация UI сейчас полностью завязана на два набора досок: LIST и KANBAN.
        // Поэтому для scrum/scrumban используем префикс KANBAN, но этапы берём по project_type.
        String boardCodePrefix = "list".equals(projectType) ? "LIST" : "KANBAN";

        List<Map<String, Object>> boardTemplates = jdbcTemplate.queryForList(
                """
                select board_name, position_no
                from seed_board_template
                where project_type = ?
                order by position_no
                limit 3
                """,
                projectType
        );
        if (boardTemplates.isEmpty()) {
            throw new IllegalStateException("Нет шаблонов досок для project_type=" + projectType);
        }

        // Создаем доски (без задач) и этапы для каждой.
        for (int i = 0; i < boardTemplates.size(); i++) {
            Map<String, Object> bt = boardTemplates.get(i);
            String boardName = String.valueOf(bt.get("board_name"));
            int positionNo = ((Number) bt.get("position_no")).intValue();

            String boardCode = boardCodePrefix + "_" + positionNo;
            jdbcTemplate.update(
                    "insert into board(name, project_id, code) values (?, ?, ?)",
                    boardName, projectId, boardCode
            );

            Long boardId = jdbcTemplate.queryForObject(
                    "select id from board where project_id = ? and code = ?",
                    Long.class,
                    projectId, boardCode
            );

            List<String> stages;
            if ("kanban".equals(projectType)) {
                stages = jdbcTemplate.query(
                        """
                        select stage_name
                        from seed_board_stage_template
                        where project_type = ?
                          and board_name = ?
                        order by position_no
                        """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        projectType,
                        boardName
                );
            } else {
                stages = jdbcTemplate.query(
                        """
                        select stage_name
                        from seed_stage_template
                        where project_type = ?
                        order by position_no
                        """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        projectType
                );
            }

            if (stages == null || stages.isEmpty()) {
                // Fallback: минимальный жизненный цикл.
                stages = List.of("Очередь", "В работе", "Готово");
            }

            for (int s = 0; s < stages.size(); s++) {
                jdbcTemplate.update(
                        "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                        boardId, stages.get(s), s + 1
                );
            }
        }
    }

    private String nextProjectCodeFromName(String orgId, String projectName) {
        String desired = toProjectCode(projectName);
        String candidate = desired;
        while (exists("select count(*) from project where organization_id = ? and code = ?", orgId, candidate)) {
            candidate = randomLetters(3);
        }
        return candidate;
    }

    private String toProjectCode(String projectName) {
        if (projectName == null) return randomLetters(3);
        String src = projectName.trim();
        if (src.isEmpty()) return randomLetters(3);

        // Мини-транслит для кириллицы: генерируем первые 3 латинские буквы.
        String translit = src
                .toLowerCase(Locale.ROOT)
                .replace('а', 'a')
                .replace('б', 'b')
                .replace('в', 'v')
                .replace('г', 'g')
                .replace('д', 'd')
                .replace('е', 'e')
                .replace('ё', 'e')
                .replace("ж", "zh")
                .replace('з', 'z')
                .replace('и', 'i')
                .replace('й', 'y')
                .replace('к', 'k')
                .replace('л', 'l')
                .replace('м', 'm')
                .replace('н', 'n')
                .replace('о', 'o')
                .replace('п', 'p')
                .replace('р', 'r')
                .replace('с', 's')
                .replace('т', 't')
                .replace('у', 'u')
                .replace('ф', 'f')
                .replace('х', 'h')
                .replace("ц", "ts")
                .replace("ч", "ch")
                .replace("ш", "sh")
                .replace("щ", "sh")
                .replace('ы', 'y')
                .replace('э', 'e')
                .replace("ю", "yu")
                .replace("я", "ya");

        String lettersOnly = translit.replaceAll("[^a-z]", "");
        if (lettersOnly.length() < 3) {
            lettersOnly = (lettersOnly + randomLetters(3)).substring(0, 3);
        }
        return lettersOnly.substring(0, 3).toUpperCase(Locale.ROOT);
    }

    private String randomLetters(int len) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    private Map<String, Object> contextByUserId(Long userId) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                """
                select org.public_id as org_public_id, t.public_id as team_public_id
                from team_membership tm
                join app_team t on t.id = tm.team_id
                join organization org on org.id = t.organization_id
                where tm.user_id = ?
                order by t.id
                limit 1
                """,
                userId
        );
        String orgPublic = String.valueOf(row.get("org_public_id"));
        String teamPublic = String.valueOf(row.get("team_public_id"));
        return Map.of(
                "organizationPublicId", orgPublic,
                "teamPublicId", teamPublic,
                "basePath", "/o/" + orgPublic + "/t/" + teamPublic
        );
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 160) String fullName,
                   @NotBlank @Pattern(regexp = EMAIL_REGEX_STRICT) @Size(max = 160) String email,
            @NotBlank @Size(min = 8, max = 120) String password,
            @NotBlank @Size(max = 180) String organizationName,
            @NotBlank @Size(max = 140) String teamName,
            @NotBlank @Size(max = 150) String projectName,
                   @Size(max = 12) String projectKey,
            @NotBlank String projectType,
            List<InviteRequest> invites
    ) {
        public List<InviteRequest> invites() {
            return invites == null ? List.of() : invites;
        }
    }

    public record InviteRequest(
                   @NotBlank @Pattern(regexp = EMAIL_REGEX_STRICT) @Size(max = 160) String email,
            @NotBlank String role
    ) {}

    public record LoginRequest(
                   @NotBlank @Pattern(regexp = EMAIL_REGEX_STRICT) String email,
            @NotBlank String password
    ) {}
}
