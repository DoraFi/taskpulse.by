package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import by.taskpulse.auth.LoginAudit;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import by.taskpulse.web.TeamContextHolder;
import by.taskpulse.web.TeamContextSupport;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerMapping;

@Component
public class LegacyDataApiController {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter INDEX_RECENT_TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter INDEX_RECENT_FALLBACK = DateTimeFormatter.ofPattern("dd.MM HH:mm");
    private static final Path TASK_UPLOADS_ROOT = Paths.get("static", "uploads", "tasks");
    private static final Pattern PASSWORD_COMPLEXITY = Pattern.compile("^(?=.*\\p{L})(?=.*\\d).{8,}$");
    private static final Pattern TEAM_CONTEXT_PATH = Pattern.compile("^/o/([^/]+)/t/([^/]+)");

    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;
    private final HttpServletRequest request;
    private final PasswordEncoder passwordEncoder;
    private final AnalyticsDashboardService analyticsDashboardService;
    private final CalendarEventService calendarEventService;
    private final StoredFileService storedFileService;

    public LegacyDataApiController(JdbcTemplate jdbcTemplate,
            CurrentUserProvider currentUserProvider,
            HttpServletRequest request,
            PasswordEncoder passwordEncoder,
            AnalyticsDashboardService analyticsDashboardService,
            CalendarEventService calendarEventService,
            StoredFileService storedFileService) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
        this.request = request;
        this.passwordEncoder = passwordEncoder;
        this.analyticsDashboardService = analyticsDashboardService;
        this.calendarEventService = calendarEventService;
        this.storedFileService = storedFileService;
    }

    @GetMapping("/api/team")
    public List<Map<String, Object>> team() {
        Long teamId = currentTeamId();
        return jdbcTemplate.query(
                """
                        select
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
                            u.full_name,
                            coalesce(u.position, 'Участник команды') as role,
                            coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                            u.public_id as user_public_id,
                            exists (
                                select 1
                                from task_status_history h
                                where h.changed_by = u.id
                                  and h.changed_at >= now() - interval '2 days'
                            ) as is_online
                        from app_user u
                        join team_membership tm on tm.user_id = u.id
                        where tm.team_id = ?
                        order by u.last_name, u.first_name
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    putPersonNameFields(
                            row,
                            rs.getString("last_name"),
                            rs.getString("first_name"),
                            null);
                    row.put("name", row.get("fullName"));
                    row.put("role", rs.getString("role"));
                    row.put("avatar", rs.getString("avatar"));
                    row.put("publicId", rs.getString("user_public_id"));
                    row.put("online", rs.getBoolean("is_online") || rowNum < 3);
                    return row;
                },
                teamId);
    }

    @GetMapping("/api/team/members")
    public Map<String, Object> teamMembersPage() {
        Long teamId = currentTeamId();
        Long currentUid = currentUserId();
        boolean canManage = currentUserCanManageTeam(teamId);

        String teamName = jdbcTemplate.queryForObject(
                "select coalesce(name, 'Команда') from app_team where id = ?",
                String.class,
                teamId);

        List<Map<String, Object>> members = jdbcTemplate.query(
                """
                        select
                            u.id,
                            u.public_id,
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
                            u.full_name,
                            u.email,
                            coalesce(u.position, 'Участник команды') as position,
                            coalesce(u.department, '') as department,
                            coalesce(u.patronymic, '') as patronymic,
                            u.birth_date,
                            coalesce(u.birth_date_visibility, 'hidden') as birth_date_visibility,
                            coalesce(u.phone, '') as phone,
                            coalesce(u.username, '') as username,
                            coalesce(u.bio, '') as bio,
                            coalesce(u.office, '') as office,
                            coalesce(u.timezone, 'Europe/Minsk') as timezone,
                            coalesce(to_char(u.team_joined_at, 'TMMonth YYYY'), '') as team_since,
                            coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                            coalesce(u.is_active, true) as is_active,
                            tm.role as membership_role,
                            coalesce(
                                (
                                    select aur.role_code
                                    from app_user_role aur
                                    where aur.user_id = u.id
                                      and aur.team_id = tm.team_id
                                      and aur.role_code in ('team_admin', 'member', 'observer')
                                    order by aur.id desc
                                    limit 1
                                ),
                                case tm.role
                                    when 'lead' then 'team_admin'
                                    when 'viewer' then 'observer'
                                    else 'member'
                                end
                            ) as access_role,
                            exists (
                                select 1
                                from task_status_history h
                                where h.changed_by = u.id
                                  and h.changed_at >= now() - interval '2 days'
                            ) as is_online,
                            (
                                select count(*)
                                from task_item ti
                                where ti.assignee_id = u.id
                            ) as assigned,
                            (
                                select count(*)
                                from task_item ti
                                where ti.assignee_id = u.id
                                  and ti.stage in ('В работе', 'Тестирование')
                            ) as in_progress,
                            (
                                select count(*)
                                from task_item ti
                                where ti.assignee_id = u.id
                                  and ti.stage = 'Готово'
                                  and ti.updated_at >= now() - interval '30 days'
                            ) as done_month
                        from app_user u
                        join team_membership tm on tm.user_id = u.id
                        where tm.team_id = ?
                        order by u.last_name, u.first_name, u.patronymic
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    long userId = rs.getLong("id");
                    String accessRole = rs.getString("access_role");
                    row.put("publicId", rs.getString("public_id"));
                    putPersonNameFields(
                            row,
                            rs.getString("last_name"),
                            rs.getString("first_name"),
                            rs.getString("patronymic"));
                    row.put("position", rs.getString("position"));
                    row.put("department", rs.getString("department"));
                    row.put("birthDateVisibility", rs.getString("birth_date_visibility"));
                    String birthDisplay = formatBirthDateForViewer(
                            rs.getObject("birth_date"),
                            rs.getString("birth_date_visibility"),
                            userId == currentUid);
                    if (birthDisplay != null) {
                        row.put("birthDisplay", birthDisplay);
                        row.put("birthFieldLabel", birthDateFieldLabel(
                                rs.getString("birth_date_visibility"),
                                userId == currentUid));
                    }
                    row.put("avatar", rs.getString("avatar"));
                    row.put("accessRole", accessRole);
                    row.put("accessRoleLabel", toHumanTeamAccessRole(accessRole));
                    row.put("canLeaveTeam", true);
                    row.put("online", rs.getBoolean("is_online"));
                    row.put("active", rs.getBoolean("is_active"));
                    row.put("assigned", rs.getInt("assigned"));
                    row.put("inProgress", rs.getInt("in_progress"));
                    row.put("doneMonth", rs.getInt("done_month"));
                    row.put("isSelf", userId == currentUid);
                    row.put("email", rs.getString("email"));
                    row.put("phone", rs.getString("phone"));
                    if (userId == currentUid) {
                        row.put("username", rs.getString("username"));
                        row.put("bio", rs.getString("bio"));
                        row.put("office", rs.getString("office"));
                        row.put("timezone", rs.getString("timezone"));
                        row.put("teamSince", rs.getString("team_since"));
                    }
                    return row;
                },
                teamId);

        List<String> positions = jdbcTemplate.query(
                """
                        select distinct trim(u.position) as position
                        from app_user u
                        join team_membership tm on tm.user_id = u.id
                        where tm.team_id = ?
                          and trim(coalesce(u.position, '')) <> ''
                          and trim(coalesce(u.position, '')) <> 'Участник команды'
                        order by position
                        """,
                (rs, rowNum) -> rs.getString("position"),
                teamId);

        List<String> departments = jdbcTemplate.query(
                """
                        select distinct trim(u.department) as department
                        from app_user u
                        join team_membership tm on tm.user_id = u.id
                        where tm.team_id = ?
                          and trim(coalesce(u.department, '')) <> ''
                          and trim(coalesce(u.department, '')) <> 'Команда'
                        order by department
                        """,
                (rs, rowNum) -> rs.getString("department"),
                teamId);

        Map<String, Object> sender = jdbcTemplate.queryForMap(
                """
                        select coalesce(email, '') as email,
                               coalesce(last_name, '') as last_name,
                               coalesce(first_name, '') as first_name,
                               coalesce(full_name, '') as full_name
                        from app_user where id = ?
                        """,
                currentUid);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("teamName", teamName);
        out.put("canManageRoles", canManage);
        out.put("currentUserEmail", sender.get("email"));
        out.put("currentUserName", composePersonName(
                String.valueOf(sender.getOrDefault("last_name", "")),
                String.valueOf(sender.getOrDefault("first_name", "")),
                ""));
        if (out.get("currentUserName").toString().isBlank()) {
            out.put("currentUserName", sender.get("full_name"));
        }
        out.put("positions", positions);
        out.put("departments", departments);
        out.put("canAddMembers", canManage);
        out.put("members", members);
        return out;
    }

    @PostMapping("/api/team/rename")
    @Transactional
    public Map<String, Object> renameTeam(@RequestBody Map<String, Object> payload) {
        Long teamId = contextTeamIdFromRequest();
        if (teamId == null) {
            teamId = currentTeamId();
        }
        if (teamId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Не удалось определить команду. Откройте страницу с адресом /o/.../t/.../");
        }
        if (!currentUserCanManageTeam(teamId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав для переименования команды");
        }
        String name = readTeamRenameValue(payload);
        if (name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Название не может быть пустым");
        }
        if (name.length() > 140) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Название не длиннее 140 символов");
        }
        int updated = jdbcTemplate.update("update app_team set name = ? where id = ?", name, teamId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Команда не найдена");
        }
        return Map.of("ok", true, "teamName", name);
    }

    @PostMapping("/api/team/members/role")
    @Transactional
    public Map<String, Object> updateTeamMemberRole(@RequestBody Map<String, Object> payload) {
        Long teamId = currentTeamId();
        if (!currentUserCanManageTeam(teamId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав для изменения ролей");
        }

        String userPublicId = String.valueOf(payload.getOrDefault("userPublicId", "")).trim();
        if (userPublicId.isBlank()) {
            if (payload.containsKey("teamName")) {
                return renameTeam(payload);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не указан участник");
        }

        String roleCode = normalizeTeamAccessRole(String.valueOf(payload.getOrDefault("roleCode", "")));

        Long targetUserId;
        try {
            targetUserId = jdbcTemplate.queryForObject(
                    """
                            select u.id
                            from app_user u
                            join team_membership tm on tm.user_id = u.id
                            where u.public_id = ? and tm.team_id = ?
                            """,
                    Long.class,
                    userPublicId,
                    teamId);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Участник не найден в этой команде");
        }

        if (targetUserId.equals(currentUserId()) && "observer".equals(roleCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Нельзя назначить себе роль наблюдателя");
        }

        Map<String, Object> teamRow = jdbcTemplate.queryForMap(
                "select organization_id from app_team where id = ?",
                teamId);
        String orgId = String.valueOf(teamRow.get("organization_id"));

        jdbcTemplate.update(
                """
                        delete from app_user_role
                        where user_id = ?
                          and team_id = ?
                          and role_code in ('team_admin', 'member', 'observer')
                        """,
                targetUserId,
                teamId);
        jdbcTemplate.update(
                """
                        insert into app_user_role(user_id, role_code, organization_id, team_id)
                        values (?, ?, ?, ?)
                        on conflict (user_id, role_code, organization_id, team_id, project_id) do nothing
                        """,
                targetUserId,
                roleCode,
                orgId,
                teamId);

        String membershipRole = switch (roleCode) {
            case "team_admin" -> "lead";
            case "observer" -> "viewer";
            default -> "member";
        };
        jdbcTemplate.update(
                "update team_membership set role = ? where team_id = ? and user_id = ?",
                membershipRole,
                teamId,
                targetUserId);

        if (payload.containsKey("position") || payload.containsKey("department")) {
            String position = String.valueOf(payload.getOrDefault("position", "")).trim();
            String department = String.valueOf(payload.getOrDefault("department", "")).trim();
            if (position.isBlank()) {
                position = "Участник команды";
            }
            jdbcTemplate.update(
                    "update app_user set position = ?, department = ? where id = ?",
                    position,
                    department,
                    targetUserId);
        }

        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("ok", true);
        ok.put("publicId", userPublicId);
        ok.put("accessRole", roleCode);
        ok.put("accessRoleLabel", toHumanTeamAccessRole(roleCode));
        ok.put("message", "Данные участника обновлены");
        return ok;
    }

    @PostMapping("/api/team/members/remove")
    @Transactional
    public Map<String, Object> removeTeamMember(@RequestBody Map<String, Object> payload) {
        Long teamId = currentTeamId();
        if (!currentUserCanManageTeam(teamId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав для удаления участников");
        }

        String userPublicId = String.valueOf(payload.getOrDefault("userPublicId", "")).trim();
        if (userPublicId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не указан участник");
        }

        Long targetUserId;
        try {
            targetUserId = jdbcTemplate.queryForObject(
                    """
                            select u.id
                            from app_user u
                            join team_membership tm on tm.user_id = u.id
                            where u.public_id = ? and tm.team_id = ?
                            """,
                    Long.class,
                    userPublicId,
                    teamId);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Участник не найден в этой команде");
        }

        if (targetUserId.equals(currentUserId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Нельзя удалить себя из команды - используйте «Покинуть команду»");
        }

        assertNotLastTeamAdmin(teamId, targetUserId);
        detachUserFromTeam(teamId, targetUserId);

        return Map.of("ok", true, "publicId", userPublicId);
    }

    @PostMapping("/api/team/members/leave")
    @Transactional
    public Map<String, Object> leaveTeam() {
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        assertNotLastTeamAdmin(teamId, uid);
        detachUserFromTeam(teamId, uid);
        return Map.of("ok", true, "left", true);
    }

    @PostMapping("/api/team/members/add")
    @Transactional
    public Map<String, Object> addTeamMember(@RequestBody Map<String, Object> payload) {
        Long teamId = currentTeamId();
        if (!currentUserCanManageTeam(teamId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав для добавления участников");
        }

        String email = String.valueOf(payload.getOrDefault("email", "")).trim().toLowerCase(Locale.ROOT);
        String roleCode = normalizeTeamAccessRole(String.valueOf(payload.getOrDefault("roleCode", "member")));
        if (email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите email участника");
        }

        Boolean alreadyMemberByEmail = jdbcTemplate.queryForObject(
                """
                        select exists(
                            select 1
                            from app_user u
                            join team_membership tm on tm.user_id = u.id
                            where tm.team_id = ?
                              and lower(trim(u.email)) = ?
                        )
                        """,
                Boolean.class,
                teamId,
                email);
        if (Boolean.TRUE.equals(alreadyMemberByEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Этот участник уже в команде");
        }

        Map<String, Object> teamRow = jdbcTemplate.queryForMap(
                "select organization_id from app_team where id = ?",
                teamId);
        String orgId = String.valueOf(teamRow.get("organization_id"));
        Long invitedBy = currentUserId();

        List<Long> existingIds = jdbcTemplate.query(
                "select id from app_user where lower(email) = ?",
                (rs, rowNum) -> rs.getLong("id"),
                email);

        if (!existingIds.isEmpty()) {
            Long userId = existingIds.get(0);
            Boolean alreadyInTeam = jdbcTemplate.queryForObject(
                    "select exists(select 1 from team_membership where team_id = ? and user_id = ?)",
                    Boolean.class,
                    teamId,
                    userId);
            if (Boolean.TRUE.equals(alreadyInTeam)) {
                jdbcTemplate.update(
                        "delete from team_invitation where team_id = ? and lower(invited_email) = ?",
                        teamId,
                        email);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Этот участник уже в команде");
            }

            assignTeamAccessRole(teamId, orgId, userId, roleCode);
            Map<String, Object> ok = new LinkedHashMap<>();
            ok.put("ok", true);
            ok.put("mode", "member");
            ok.put("email", email);
            ok.put("accessRole", roleCode);
            ok.put("accessRoleLabel", toHumanTeamAccessRole(roleCode));
            ok.put("message", "Участник добавлен в команду");
            return ok;
        }

        Boolean invitePending = jdbcTemplate.queryForObject(
                """
                        select exists(
                            select 1 from team_invitation
                            where team_id = ? and lower(invited_email) = ? and status = 'sent'
                        )
                        """,
                Boolean.class,
                teamId,
                email);
        if (Boolean.TRUE.equals(invitePending)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Приглашение на этот email уже отправлено");
        }

        jdbcTemplate.update(
                """
                        insert into team_invitation(organization_id, team_id, invited_email, invited_role, status, invited_by)
                        values (?, ?, ?, ?, 'sent', ?)
                        """,
                orgId,
                teamId,
                email,
                roleCode,
                invitedBy);

        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("ok", true);
        ok.put("mode", "invitation");
        ok.put("email", email);
        ok.put("accessRole", roleCode);
        ok.put("accessRoleLabel", toHumanTeamAccessRole(roleCode));
        ok.put("message", "Приглашение отправлено на " + email);
        return ok;
    }

    @PostMapping("/api/team/members/message")
    @Transactional
    public Map<String, Object> sendTeamMemberMessage(@RequestBody Map<String, Object> payload) {
        Long teamId = currentTeamId();
        Long senderId = currentUserId();

        String userPublicId = String.valueOf(payload.getOrDefault("userPublicId", "")).trim();
        String subject = String.valueOf(payload.getOrDefault("subject", "")).trim();
        String body = String.valueOf(payload.getOrDefault("body", "")).trim();

        if (userPublicId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не указан получатель");
        }
        if (subject.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите тему письма");
        }
        if (body.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Введите текст сообщения");
        }

        Map<String, Object> sender = jdbcTemplate.queryForMap(
                "select coalesce(email, '') as email, coalesce(full_name, '') as full_name from app_user where id = ?",
                senderId);
        String fromEmail = String.valueOf(sender.get("email")).trim();
        if (fromEmail.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите email в профиле перед отправкой");
        }

        Map<String, Object> recipient;
        try {
            recipient = jdbcTemplate.queryForMap(
                    """
                            select u.id as user_id, coalesce(u.email, '') as email, coalesce(u.full_name, '') as full_name
                            from app_user u
                            join team_membership tm on tm.user_id = u.id
                            where u.public_id = ? and tm.team_id = ?
                            """,
                    userPublicId,
                    teamId);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Получатель не найден в этой команде");
        }

        Long recipientId = ((Number) recipient.get("user_id")).longValue();
        String toEmail = String.valueOf(recipient.get("email")).trim();
        if (toEmail.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "У получателя не указан email");
        }
        if (recipientId.equals(senderId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Нельзя отправить письмо самому себе");
        }

        jdbcTemplate.update(
                """
                        insert into team_mail_message(team_id, from_user_id, to_user_id, from_email, to_email, subject, body)
                        values (?, ?, ?, ?, ?, ?, ?)
                        """,
                teamId,
                senderId,
                recipientId,
                fromEmail,
                toEmail,
                subject,
                body);

        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("ok", true);
        ok.put("fromEmail", fromEmail);
        ok.put("toEmail", toEmail);
        ok.put("recipientName", recipient.get("full_name"));
        ok.put("message", "Сообщение отправлено на " + toEmail);
        return ok;
    }

    public Map<String, Object> listMyTeams() {
        Long uid = currentUserId();
        final String currentOrg;
        final String currentTeam;
        Optional<String[]> contextIds = resolveTeamContextFromRequest();
        if (contextIds.isPresent()) {
            currentOrg = contextIds.get()[0];
            currentTeam = contextIds.get()[1];
        } else {
            currentOrg = null;
            currentTeam = null;
        }

        List<Map<String, Object>> teams = jdbcTemplate.query(
                """
                        select
                            org.public_id as organization_public_id,
                            t.public_id as team_public_id,
                            coalesce(t.name, 'Команда') as team_name,
                            coalesce(tm.role, 'member') as membership_role
                        from team_membership tm
                        join app_team t on t.id = tm.team_id
                        join organization org on org.id = t.organization_id
                        where tm.user_id = ?
                        order by t.name, t.id
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    String orgPublicId = rs.getString("organization_public_id");
                    String teamPublicId = rs.getString("team_public_id");
                    String membershipRole = rs.getString("membership_role");
                    row.put("organizationPublicId", orgPublicId);
                    row.put("teamPublicId", teamPublicId);
                    row.put("teamName", rs.getString("team_name"));
                    row.put("membershipRole", membershipRole);
                    row.put("roleLabel", toHumanMembershipRole(membershipRole));
                    row.put("basePath", "/o/" + orgPublicId + "/t/" + teamPublicId);
                    boolean isCurrent = currentOrg != null
                            && currentTeam != null
                            && currentOrg.equals(orgPublicId)
                            && currentTeam.equals(teamPublicId);
                    row.put("current", isCurrent);
                    return row;
                },
                uid);

        if (teams.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("teams", teams);
            out.put("canSwitch", false);
            return out;
        }

        boolean hasCurrent = teams.stream().anyMatch(t -> Boolean.TRUE.equals(t.get("current")));
        if (!hasCurrent && currentOrg == null) {
            teams.get(0).put("current", true);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("teams", teams);
        out.put("canSwitch", teams.size() > 1);
        if (currentOrg != null) {
            out.put("currentOrganizationPublicId", currentOrg);
        }
        if (currentTeam != null) {
            out.put("currentTeamPublicId", currentTeam);
        }
        return out;
    }

    @GetMapping("/api/me")
    public Map<String, Object> me() {
        Long uid = currentUserId();
        Long contextTeamId = currentTeamId();
        List<Long> visibleIds = visibleProjectIds();
        Map<String, Object> base = queryMeProfileRow(uid, contextTeamId);

        Integer assigned = jdbcTemplate.queryForObject("select count(*) from task_item where assignee_id = ?",
                Integer.class, uid);
        Integer inProgress = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage in ('В работе','Тестирование')",
                Integer.class, uid);
        Integer weekActivity = jdbcTemplate.queryForObject(
                "select count(*) from task_status_history where changed_by = ? and changed_at >= now() - interval '7 days'",
                Integer.class, uid);
        Integer monthDone = jdbcTemplate.queryForObject(
                "select count(*) from task_item where assignee_id = ? and stage = 'Готово' and updated_at >= now() - interval '30 days'",
                Integer.class, uid);

        List<Map<String, Object>> projects;
        if (visibleIds.isEmpty()) {
            projects = List.of();
        } else {
            String visibleProjectsSql = inClauseSql(visibleIds);
            projects = jdbcTemplate.query(
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
                    uid);
        }

        String timezone = String.valueOf(base.get("timezone"));
        String lastLoginClient = String.valueOf(base.get("last_login_client"));
        if ("null".equalsIgnoreCase(lastLoginClient)) {
            lastLoginClient = "";
        }
        String previousLoginClient = String.valueOf(base.get("previous_login_client"));
        if ("null".equalsIgnoreCase(previousLoginClient)) {
            previousLoginClient = "";
        }

        List<Map<String, Object>> activity = new ArrayList<>();
        activity.add(activityRow(
                "Последний вход",
                LoginAudit.formatLoginActivityValue(base.get("last_login_at"), lastLoginClient, timezone)));
        activity.add(activityRow("Двухфакторная защита", "Выключена"));

        List<Map<String, Object>> sessions = new ArrayList<>();
        Object lastLoginAt = base.get("last_login_at");
        if (lastLoginAt != null) {
            String currentDevice = lastLoginClient.isBlank()
                    ? "Это устройство"
                    : "Это устройство · " + lastLoginClient;
            sessions.add(LoginAudit.sessionRow(true, currentDevice, lastLoginAt, timezone));
            Object previousLoginAt = base.get("previous_login_at");
            if (previousLoginAt != null) {
                String prevDevice = previousLoginClient.isBlank() ? "Другое устройство" : previousLoginClient;
                sessions.add(LoginAudit.sessionRow(false, prevDevice, previousLoginAt, timezone));
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", base.get("id"));
        out.put("publicId", base.get("user_public_id"));
        putPersonNameFields(
                out,
                String.valueOf(base.get("last_name")),
                String.valueOf(base.get("first_name")),
                String.valueOf(base.get("patronymic")));
        out.put("email", base.get("email"));
        out.put("username", base.get("username"));
        out.put("avatar", base.get("avatar"));
        out.put("position", base.get("position"));
        out.put("department", base.get("department"));
        out.put("birthDateVisibility", base.get("birth_date_visibility"));
        Object birthRaw = base.get("birth_date");
        if (birthRaw != null) {
            out.put("birthDate", toIsoDate(birthRaw));
            out.put("birthDisplay",
                    formatBirthDateForViewer(birthRaw, String.valueOf(base.get("birth_date_visibility")), true));
        }
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
        out.put("sessions", sessions);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("assigned", assigned == null ? 0 : assigned);
        stats.put("inProgress", inProgress == null ? 0 : inProgress);
        stats.put("weekActivity", weekActivity == null ? 0 : weekActivity);
        stats.put("monthDone", monthDone == null ? 0 : monthDone);
        out.put("stats", stats);

        Long teamId = currentTeamId();
        String teamAccessRole = resolveUserTeamAccessRole(uid, teamId);
        out.put("teamAccessRole", teamAccessRole);
        out.put("teamAccessRoleLabel", toHumanTeamAccessRole(teamAccessRole));
        out.put("canManageTeamRoles", currentUserCanManageTeam(teamId));
        out.put("canLeaveTeam", teamId != null && !String.valueOf(base.get("team_public_id")).isBlank());
        return out;
    }

    private Map<String, Object> queryMeProfileRow(Long uid, Long contextTeamId) {
        if (contextTeamId != null) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    """
                            select
                                u.public_id as user_public_id,
                                u.id,
                                coalesce(u.last_name, '') as last_name,
                                coalesce(u.first_name, '') as first_name,
                                u.full_name,
                                u.email,
                                coalesce(u.username, 'user') as username,
                                coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                                coalesce(u.position, 'Участник команды') as position,
                                coalesce(u.department, 'Команда') as department,
                                coalesce(u.patronymic, '') as patronymic,
                                u.birth_date,
                                coalesce(u.birth_date_visibility, 'hidden') as birth_date_visibility,
                                coalesce(u.phone, '') as phone,
                                coalesce(u.timezone, 'Europe/Minsk') as timezone,
                                coalesce(u.office, '') as office,
                                coalesce(u.bio, '') as bio,
                                u.last_login_at,
                                coalesce(u.last_login_client, '') as last_login_client,
                                u.previous_login_at,
                                coalesce(u.previous_login_client, '') as previous_login_client,
                                coalesce(to_char(tms.joined_at, 'TMMonth YYYY'), '') as team_since,
                                coalesce(tm.name, 'Без команды') as team_name,
                                coalesce(tm.public_id, '') as team_public_id,
                                coalesce(org.public_id, '') as organization_public_id
                            from app_user u
                            join team_membership tms on tms.user_id = u.id and tms.team_id = ?
                            join app_team tm on tm.id = tms.team_id
                            join organization org on org.id = tm.organization_id
                            where u.id = ?
                            """,
                    contextTeamId, uid);
            if (!rows.isEmpty()) {
                return rows.get(0);
            }
        }
        return jdbcTemplate.queryForMap(
                """
                        select
                            u.public_id as user_public_id,
                            u.id,
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
                            u.full_name,
                            u.email,
                            coalesce(u.username, 'user') as username,
                            coalesce(u.avatar_file, 'basic_avatar.png') as avatar,
                            coalesce(u.position, 'Участник команды') as position,
                            coalesce(u.department, 'Команда') as department,
                            coalesce(u.patronymic, '') as patronymic,
                            u.birth_date,
                            coalesce(u.birth_date_visibility, 'hidden') as birth_date_visibility,
                            coalesce(u.phone, '') as phone,
                            coalesce(u.timezone, 'Europe/Minsk') as timezone,
                            coalesce(u.office, '') as office,
                            coalesce(u.bio, '') as bio,
                            u.last_login_at,
                            coalesce(u.last_login_client, '') as last_login_client,
                            u.previous_login_at,
                            coalesce(u.previous_login_client, '') as previous_login_client,
                            coalesce(to_char(u.team_joined_at, 'TMMonth YYYY'), '') as team_since,
                            coalesce(tm.name, 'Без команды') as team_name,
                            coalesce(tm.public_id, '') as team_public_id,
                            coalesce(org.public_id, '') as organization_public_id
                        from app_user u
                        left join team_membership tms on tms.user_id = u.id
                        left join app_team tm on tm.id = tms.team_id
                        left join organization org on org.id = tm.organization_id
                        where u.id = ?
                        order by tm.id
                        limit 1
                        """,
                uid);
    }

    @PostMapping("/api/me/update")
    @Transactional
    public Map<String, Object> updateMeProfile(@RequestBody Map<String, Object> payload) {
        Long uid = currentUserId();
        String lastName = String.valueOf(payload.getOrDefault("lastName", "")).trim();
        String firstName = String.valueOf(payload.getOrDefault("firstName", "")).trim();
        String patronymic = String.valueOf(payload.getOrDefault("patronymic", "")).trim();
        String email = String.valueOf(payload.getOrDefault("email", "")).trim();
        String phone = String.valueOf(payload.getOrDefault("phone", "")).trim();
        String timezone = String.valueOf(payload.getOrDefault("timezone", "Europe/Minsk")).trim();
        String office = String.valueOf(payload.getOrDefault("office", "")).trim();
        String bio = String.valueOf(payload.getOrDefault("bio", "")).trim();
        String birthVisibility = normalizeBirthDateVisibility(
                String.valueOf(payload.getOrDefault("birthDateVisibility", "hidden")));
        String birthDateRaw = String.valueOf(payload.getOrDefault("birthDate", "")).trim();

        if (lastName.isBlank() || firstName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите фамилию и имя");
        }
        String fullName = composePersonName(lastName, firstName, patronymic);

        Date birthDate = null;
        if (!birthDateRaw.isBlank() && !"null".equalsIgnoreCase(birthDateRaw)) {
            try {
                birthDate = Date.valueOf(LocalDate.parse(birthDateRaw));
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Некорректная дата рождения");
            }
        }

        jdbcTemplate.update(
                """
                        update app_user
                        set last_name = ?,
                            first_name = ?,
                            full_name = ?,
                            patronymic = ?,
                            email = ?,
                            phone = ?,
                            timezone = ?,
                            office = ?,
                            bio = ?,
                            birth_date = ?,
                            birth_date_visibility = ?
                        where id = ?
                        """,
                lastName,
                firstName,
                fullName,
                patronymic.isBlank() ? null : patronymic,
                email,
                phone,
                timezone,
                office,
                bio,
                birthDate,
                birthVisibility,
                uid);

        return Map.of("ok", true);
    }

    @PostMapping("/api/me/change-password")
    @Transactional
    public Map<String, Object> changeMePassword(@RequestBody Map<String, Object> payload) {
        Long uid = currentUserId();
        String currentPassword = String.valueOf(payload.getOrDefault("currentPassword", ""));
        String newPassword = String.valueOf(payload.getOrDefault("newPassword", ""));
        String newPasswordConfirm = String.valueOf(payload.getOrDefault("newPasswordConfirm", ""));

        if (currentPassword.isBlank() || newPassword.isBlank() || newPasswordConfirm.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Заполните все поля пароля");
        }
        if (!newPassword.equals(newPasswordConfirm)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Новый пароль и повтор не совпадают");
        }
        if (!PASSWORD_COMPLEXITY.matcher(newPassword).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Новый пароль должен содержать буквы и цифры и быть длиной от 8 символов");
        }
        if (currentPassword.equals(newPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Новый пароль должен отличаться от текущего");
        }

        Map<String, Object> user;
        try {
            user = jdbcTemplate.queryForMap(
                    "select password_hash from app_user where id = ? and is_active = true",
                    uid);
        } catch (DataAccessException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден");
        }

        String hash = String.valueOf(user.get("password_hash"));
        if (!passwordEncoder.matches(currentPassword, hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Неверный текущий пароль");
        }

        jdbcTemplate.update(
                "update app_user set password_hash = ? where id = ?",
                passwordEncoder.encode(newPassword),
                uid);

        return Map.of("ok", true);
    }

    @GetMapping("/api/boards")
    public Map<String, Object> boards(@RequestParam(required = false) String project) {
        boolean withProjectFilter = project != null && !project.isBlank();
        String visibleProjectsSql = visibleProjectsInClause();
        String archiveFilter = boardProjectArchiveFilter(withProjectFilter);
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
                    """ + sqlPersonDisplayName("u")
                + """
                        as assignee_name,
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
                                       """
                + archiveFilter + """
                        and b.project_id in (""" + visibleProjectsSql + """
                        ) """ + (project != null && !project.isBlank() ? " and p.code = ? " : "")
                + " order by b.id, t.id";
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
                task.put("dependencyLabel", row.get("dep_out_task_public_id") + " - " + row.get("dep_out_task_name"));
            } else if (depInId != null) {
                task.put("dependencyTaskId", ((Number) depInId).longValue());
                task.put("dependencyType", "blocks");
                task.put("dependencyLabel", row.get("dep_in_task_public_id") + " - " + row.get("dep_in_task_name"));
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
        boolean withProjectFilter = project != null && !project.isBlank();
        Long teamId = currentTeamId();
        List<Long> scopedProjectIds = withProjectFilter
                ? resolveProjectIdsForKanbanFilter(project)
                : visibleProjectIdsSafe();
        if (withProjectFilter && teamId != null) {
            scopedProjectIds.forEach(projectId -> ensureProjectTeamLink(teamId, projectId));
            for (Long projectId : scopedProjectIds) {
                ensureKanbanBoardsForProject(projectId);
            }
        }
        if (scopedProjectIds.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("boards", List.of());
            return empty;
        }
        String projectsIn = inClauseSql(scopedProjectIds);
        String archiveFilter = boardProjectArchiveFilter(withProjectFilter);
        String boardKindFilter = withProjectFilter ? "" : " and (b.code like 'KANBAN%' or b.code like 'SCRUM%') ";
        String projectTypeFilter = withProjectFilter ? "" : " and p.project_type in ('kanban', 'scrum') ";
        String projectFilter = " and b.project_id in (" + projectsIn + ") ";
        String sql = """
                select b.id, b.name, p.project_type, b.sprint_started_at, b.sprint_finished_at
                from board b
                join project p on p.id = b.project_id
                where 1=1
                """ + archiveFilter + """
                """ + boardKindFilter + projectTypeFilter + projectFilter + " order by b.id";
        List<Map<String, Object>> boards = jdbcTemplate.queryForList(sql);

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
            row.put("sprintStartedAt", toIsoDateTime(mapGetCi(b, "sprint_started_at")));
            row.put("sprintFinishedAt", toIsoDateTime(mapGetCi(b, "sprint_finished_at")));
            row.put("tasksSource", "/api/kanban/tasks?boardId=" + boardId
                    + (project != null && !project.isBlank() ? "&project=" + project : ""));
            row.put("archivedTasks", List.of());
            resultBoards.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("boards", resultBoards);
        return out;
    }

    @GetMapping("/api/kanban/tasks")
    public Map<String, Object> kanbanTasks(@RequestParam(required = false) Long boardId,
            @RequestParam(required = false) String project) {
        try {
            boolean withProjectFilter = project != null && !project.isBlank();
            List<Long> scopedProjectIds = withProjectFilter
                    ? resolveProjectIdsForKanbanFilter(project)
                    : visibleProjectIdsSafe();
            if (scopedProjectIds.isEmpty()) {
                return Map.of("tasks", List.of());
            }
            String projectsIn = inClauseSql(scopedProjectIds);
            String archiveFilter = boardProjectArchiveFilter(withProjectFilter);
            String boardKindFilter = withProjectFilter ? "" : " and (b.code like 'KANBAN%' or b.code like 'SCRUM%') ";
            String projectFilter = " and b.project_id in (" + projectsIn + ") ";
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
                        """ + sqlPersonDisplayName("u")
                    + """
                            as assignee_name,
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
                                           """
                    + archiveFilter + """
                            """ + boardKindFilter + projectFilter
                    + (boardId != null ? " and t.board_id = ? " : "") + " order by t.id";

            List<Map<String, Object>> rows = boardId != null
                    ? jdbcTemplate.queryForList(sql, boardId)
                    : jdbcTemplate.queryForList(sql);

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
                    t.put("dependencyLabel", row.get("dep_out_task_public_id") + " - " + row.get("dep_out_task_name"));
                } else if (depInId != null) {
                    t.put("dependencyTaskId", ((Number) depInId).longValue());
                    t.put("dependencyType", "blocks");
                    t.put("dependencyLabel", row.get("dep_in_task_public_id") + " - " + row.get("dep_in_task_name"));
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
                "select stage as old_stage, archived_at as old_archived_at, assignee_id as old_assignee_id from task_item where id = ?",
                taskId);
        String oldStage = oldRow.get("old_stage") == null ? null : String.valueOf(oldRow.get("old_stage")).trim();
        Object oldArchivedAt = oldRow.get("old_archived_at");
        Object oldAssigneeId = oldRow.get("old_assignee_id");
        Object nextArchivedAt = "Готово".equals(stage)
                ? ("Готово".equals(oldStage) ? oldArchivedAt : Timestamp.from(Instant.now()))
                : null;
        Long uid = currentUserId();
        Long nextAssigneeId = oldAssigneeId == null ? null : ((Number) oldAssigneeId).longValue();
        boolean stageChanged = !Objects.equals(oldStage, stage);
        if (nextAssigneeId == null && stageChanged) {
            nextAssigneeId = uid;
        }
        int updated = jdbcTemplate.update(
                """
                        update task_item
                        set board_id = ?, stage = ?, priority = ?, assignee_id = ?, archived_at = ?, updated_at = now()
                        where id = ?
                        """,
                boardId,
                stage,
                (priority == null || priority.isBlank()) ? "обычный" : priority,
                nextAssigneeId,
                nextArchivedAt,
                taskId);
        if (updated == 0) {
            throw new IllegalArgumentException("Задача не найдена");
        }
        if (stageChanged) {
            insertTaskStatusHistory(taskId, uid, oldStage, stage, "user");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("assigneeAssigned", nextAssigneeId != null && oldAssigneeId == null && stageChanged);
        return out;
    }

    private void insertTaskStatusHistory(long taskId, long changedBy, String oldStage, String newStage,
            String changeSource) {
        String src = changeSource == null || changeSource.isBlank() ? "user" : changeSource;
        if (hasColumn("task_status_history", "change_source")) {
            jdbcTemplate.update(
                    """
                            insert into task_status_history(task_id, changed_by, old_stage, new_stage, changed_at, change_source)
                            values (?, ?, ?, ?, now(), ?)
                            """,
                    taskId, changedBy, oldStage, newStage, src);
        } else {
            if ("sprint_auto".equals(src)) {
                return;
            }
            jdbcTemplate.update(
                    "insert into task_status_history(task_id, changed_by, old_stage, new_stage, changed_at) values (?, ?, ?, ?, now())",
                    taskId, changedBy, oldStage, newStage);
        }
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
                subtaskId);
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
        String description = payload.get("description") == null ? null
                : String.valueOf(payload.get("description")).trim();
        String dependencyType = payload.get("dependencyType") == null ? null
                : String.valueOf(payload.get("dependencyType")).trim();
        Number dependencyTaskIdNum = payload.get("dependencyTaskId") instanceof Number n ? n : null;

        Object storyPointsObj = payload.get("storyPoints");
        Object estimateHoursObj = payload.get("estimateHours");
        String assigneeName = payload.get("assignee") == null ? null : String.valueOf(payload.get("assignee")).trim();

        if (boardIdNum == null || name == null || name.isBlank()) {
            throw new IllegalArgumentException("boardId и name обязательны");
        }

        if (stage == null || stage.isBlank())
            stage = "Очередь";
        if (priority == null || priority.isBlank())
            priority = "обычный";
        Timestamp archivedAt = "Готово".equals(stage) ? Timestamp.from(Instant.now()) : null;

        Long teamId = currentTeamId();
        Long creatorId = currentUserId();
        resolveProjectIdFromContextPath().ifPresent(projectId -> ensureProjectTeamLink(teamId, projectId));
        Map<String, Object> boardRow;
        try {
            boardRow = jdbcTemplate.queryForMap(
                    """
                            select
                                b.id as board_id,
                                b.project_id as project_id,
                                trim(cast(p.code as text)) as project_code
                            from board b
                            join project p on p.id = b.project_id
                            where b.id = ?
                              and exists (
                                select 1 from project_team pt
                                where pt.project_id = p.id and pt.team_id = ?
                              )
                            limit 1
                            """,
                    boardIdNum.longValue(), teamId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            Long projectId = jdbcTemplate.query(
                    """
                            select b.project_id
                            from board b
                            join project_member pm on pm.project_id = b.project_id and pm.user_id = ?
                            where b.id = ?
                            limit 1
                            """,
                    (rs, rowNum) -> rs.getLong("project_id"),
                    creatorId,
                    boardIdNum.longValue()).stream().findFirst().orElse(null);
            if (projectId != null) {
                ensureProjectTeamLink(teamId, projectId);
                boardRow = jdbcTemplate.queryForMap(
                        """
                                select
                                    b.id as board_id,
                                    b.project_id as project_id,
                                    trim(cast(p.code as text)) as project_code
                                from board b
                                join project p on p.id = b.project_id
                                where b.id = ?
                                  and exists (
                                    select 1 from project_team pt
                                    where pt.project_id = p.id and pt.team_id = ?
                                  )
                                limit 1
                                """,
                        boardIdNum.longValue(), teamId);
            } else {
                throw new IllegalArgumentException("Доска недоступна в этой команде");
            }
        }
        ensureProjectTeamLink(teamId, ((Number) boardRow.get("project_id")).longValue());

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
                              and (""" + sqlPersonDisplayName("u") + """
                            = ? or u.full_name = ?)
                                               limit 1
                                               """,
                    (rs, rowNum) -> rs.getLong("id"),
                    teamId, assigneeName, assigneeName);
            if (!ids.isEmpty())
                assigneeId = ids.get(0);
        }

        Integer nextN = jdbcTemplate.queryForObject(
                """
                        select coalesce(max(substring(task_code from '[0-9]+$')::int), 0) + 1
                        from task_item
                        where task_code like ?
                        """,
                Integer.class,
                projectCode + "-%");
        String taskCode = projectCode + "-" + nextN;

        java.sql.Date startDate = null;
        java.sql.Date endDate = null;
        java.sql.Date dueDate = null;
        if (startIso != null && !startIso.isBlank())
            startDate = Date.valueOf(java.time.LocalDate.parse(startIso));
        if (endIso != null && !endIso.isBlank())
            endDate = Date.valueOf(java.time.LocalDate.parse(endIso));
        if (dueIso != null && !dueIso.isBlank())
            dueDate = Date.valueOf(java.time.LocalDate.parse(dueIso));
        if (dueDate == null)
            dueDate = endDate != null ? endDate : startDate;

        Integer storyPoints = null;
        if (storyPointsObj != null) {
            if (storyPointsObj instanceof Number n)
                storyPoints = n.intValue();
            else
                storyPoints = Integer.parseInt(String.valueOf(storyPointsObj));
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
                taskCode, description, storyPoints, estimateHours, startDate, endDate, archivedAt);

        Long taskId = jdbcTemplate.queryForObject(
                "select id from task_item where task_code = ? order by id desc limit 1",
                Long.class,
                taskCode);
        insertTaskStatusHistory(taskId, creatorId, null, stage, "user");
        if (taskId != null && dependencyTaskIdNum != null && dependencyTaskIdNum.longValue() > 0
                && dependencyType != null && !dependencyType.isBlank()) {
            saveTaskDependency(taskId, dependencyTaskIdNum.longValue(), dependencyType);
        }

        return Map.of("ok", true, "taskCode", taskCode, "taskId", taskId);
    }

    @PostMapping("/api/kanban/tasks/update")
    public Map<String, Object> updateKanbanTask(@RequestBody Map<String, Object> payload) {
        Number taskIdNum = (Number) payload.get("taskId");
        if (taskIdNum == null)
            throw new IllegalArgumentException("taskId обязателен");
        Long taskId = taskIdNum.longValue();

        Long uid = currentUserId();
        Long teamId = resolveTeamIdForAccessibleTask(taskId, uid);
        if (teamId == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Задача не найдена или нет доступа");
        }

        String name = payload.get("name") == null ? null : String.valueOf(payload.get("name")).trim();
        String description = payload.get("description") == null ? null
                : String.valueOf(payload.get("description")).trim();
        String stage = payload.get("stage") == null ? null : String.valueOf(payload.get("stage")).trim();
        String priority = payload.get("priority") == null ? null : String.valueOf(payload.get("priority")).trim();
        String dueIso = payload.get("dueDate") == null ? null : String.valueOf(payload.get("dueDate")).trim();
        String startIso = payload.get("startDate") == null ? null : String.valueOf(payload.get("startDate")).trim();
        String endIso = payload.get("endDate") == null ? null : String.valueOf(payload.get("endDate")).trim();
        String assigneeName = payload.get("assignee") == null ? null : String.valueOf(payload.get("assignee")).trim();
        Object storyPointsObj = payload.get("storyPoints");
        Object estimateHoursObj = payload.get("estimateHours");
        String dependencyType = payload.get("dependencyType") == null ? null
                : String.valueOf(payload.get("dependencyType")).trim();
        Number dependencyTaskIdNum = payload.get("dependencyTaskId") instanceof Number n ? n : null;

        if (name == null || name.isBlank())
            throw new IllegalArgumentException("name обязателен");
        if (stage == null || stage.isBlank())
            stage = "Очередь";
        if (priority == null || priority.isBlank())
            priority = "обычный";

        java.sql.Date startDate = null;
        java.sql.Date endDate = null;
        java.sql.Date dueDate = null;
        if (startIso != null && !startIso.isBlank())
            startDate = Date.valueOf(java.time.LocalDate.parse(startIso));
        if (endIso != null && !endIso.isBlank())
            endDate = Date.valueOf(java.time.LocalDate.parse(endIso));
        if (dueIso != null && !dueIso.isBlank())
            dueDate = Date.valueOf(java.time.LocalDate.parse(dueIso));
        if (dueDate == null)
            dueDate = endDate != null ? endDate : startDate;

        Long assigneeId = null;
        if (assigneeName != null && !assigneeName.isBlank()) {
            List<Long> ids = jdbcTemplate.query(
                    """
                            select u.id
                            from app_user u
                            join team_membership tm on tm.user_id = u.id
                            where tm.team_id = ?
                              and (""" + sqlPersonDisplayName("u") + """
                            = ? or u.full_name = ?)
                                               limit 1
                                               """,
                    (rs, rowNum) -> rs.getLong("id"),
                    teamId, assigneeName, assigneeName);
            if (!ids.isEmpty())
                assigneeId = ids.get(0);
        }

        Integer storyPoints = null;
        if (storyPointsObj != null && storyPointsObj instanceof Number n)
            storyPoints = n.intValue();
        if (storyPointsObj != null && !(storyPointsObj instanceof Number)) {
            String spRaw = String.valueOf(storyPointsObj).trim();
            if (!spRaw.isEmpty())
                storyPoints = Integer.parseInt(spRaw);
        }

        java.math.BigDecimal estimateHours = null;
        if (estimateHoursObj != null && estimateHoursObj instanceof Number n)
            estimateHours = new java.math.BigDecimal(String.valueOf(n));
        if (estimateHoursObj != null && !(estimateHoursObj instanceof Number)) {
            String hRaw = String.valueOf(estimateHoursObj).trim();
            if (!hRaw.isEmpty())
                estimateHours = new java.math.BigDecimal(hRaw);
        }

        Map<String, Object> oldRow = jdbcTemplate.queryForMap(
                """
                        select t.stage as old_stage
                             , t.archived_at as old_archived_at
                             , t.assignee_id as old_assignee_id
                        from task_item t
                        join board b on b.id = t.board_id
                        join project p on p.id = b.project_id
                        join project_team pt on pt.project_id = p.id
                        where t.id = ?
                          and pt.team_id = ?
                        limit 1
                        """,
                taskId, teamId);
        String oldStage = oldRow.get("old_stage") == null ? null : String.valueOf(oldRow.get("old_stage")).trim();
        Object oldArchivedAt = oldRow.get("old_archived_at");
        Object oldAssigneeId = oldRow.get("old_assignee_id");
        boolean stageChanged = !Objects.equals(oldStage, stage);
        Object nextArchivedAt = "Готово".equals(stage)
                ? ("Готово".equals(oldStage) ? oldArchivedAt : Timestamp.from(Instant.now()))
                : null;
        if (assigneeId == null && oldAssigneeId == null && stageChanged) {
            assigneeId = uid;
        }

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
                name, description, stage, priority, dueDate, startDate, endDate, assigneeId, storyPoints, estimateHours,
                nextArchivedAt, taskId);
        jdbcTemplate.update("delete from task_dependency where task_id = ? or depends_on_task_id = ?", taskId, taskId);
        if (dependencyTaskIdNum != null && dependencyTaskIdNum.longValue() > 0
                && dependencyType != null && !dependencyType.isBlank()) {
            saveTaskDependency(taskId, dependencyTaskIdNum.longValue(), dependencyType);
        }

        if (!Objects.equals(oldStage, stage)) {
            insertTaskStatusHistory(taskId, uid, oldStage, stage, "user");
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
                taskId, teamId);
        if (allowed == null || allowed == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к задаче");
        }

        String original = file.getOriginalFilename() == null ? "file"
                : Path.of(file.getOriginalFilename()).getFileName().toString();

        StoredFileService.StoredFile sf = storedFileService.storeOrReuse(file);
        String fileUrl = sf.url();
        jdbcTemplate.update(
                """
                        insert into task_attachment(task_id, uploaded_by, file_name, file_url, stored_file_id, created_at)
                        values (?, ?, ?, ?, ?, now())
                        """,
                taskId, userId, original, fileUrl, sf.id());

        return Map.of(
                "ok", true,
                "fileName", original,
                "fileUrl", fileUrl);
    }

    @GetMapping("/api/kanban/tasks/attachments")
    public List<Map<String, Object>> taskAttachments(@RequestParam Long taskId) {
        if (taskId == null || taskId <= 0)
            return List.of();
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
                taskId, teamId);
        if (allowed == null || allowed == 0)
            return List.of();
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
                    row.put("createdAt", rs.getTimestamp("created_at") == null ? null
                            : rs.getTimestamp("created_at").toInstant().toString());
                    return row;
                },
                taskId);
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
                attachmentId, teamId);
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
        Long teamId = currentTeamId();
        ensureProjectTeamLinksForUserInTeam(currentUserId(), teamId);
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) {
            return List.of();
        }
        String projectArchive = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
        String projectsIn = inClauseSql(visibleIds);
        return jdbcTemplate.query(
                """
                        select
                            t.id, t.task_code, t.name, t.stage, t.priority, t.due_date, t.created_at, t.updated_at,
                            t.story_points, t.estimate_hours, t.assignee_id, t.creator_id,
                            coalesce(t.description, '') as description,
                            coalesce(p.project_type, 'list') as project_type,
                            """ + sqlPersonDisplayName("a") + """
                        as assignee_name,
                                           a.avatar_file as assignee_avatar,
                                           """ + sqlPersonDisplayName("c") + """
                        as creator_name,
                                           c.avatar_file as creator_avatar,
                                           p.name as project_name
                                       from task_item t
                                       join board b on b.id = t.board_id
                                       join project p on p.id = b.project_id
                                       left join app_user a on a.id = t.assignee_id
                                       left join app_user c on c.id = t.creator_id
                                       where p.id in ("""
                        + projectsIn
                        + ")"
                        + projectArchive
                        + """
                                order by t.id
                                """,
                (rs, rowNum) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String dueDate = toUiDate(rs.getDate("due_date"));
                    String stage = rs.getString("stage");
                    m.put("taskDbId", rs.getLong("id"));
                    m.put("id",
                            rs.getString("task_code") != null ? rs.getString("task_code") : "TSK-" + rs.getLong("id"));
                    m.put("name", rs.getString("name"));
                    m.put("stage", stage);
                    m.put("description", rs.getString("description"));
                    m.put("projectType", rs.getString("project_type"));
                    m.put("status", toLegacyStatus(stage));
                    m.put("dueDate", dueDate);
                    m.put("completedDate", "Готово".equals(stage) ? toUiDate(rs.getDate("updated_at")) : null);
                    m.put("priority", rs.getString("priority"));
                    m.put("createdDate", toUiDate(rs.getDate("created_at")));
                    m.put("complexity", rs.getObject("story_points") != null ? rs.getInt("story_points") : 3);
                    m.put("storyPoints", rs.getObject("story_points") != null ? rs.getInt("story_points") : null);
                    String estimate = rs.getObject("estimate_hours") != null
                            ? formatEstimateHours(rs.getBigDecimal("estimate_hours"))
                            : "8";
                    m.put("timeEstimate", estimate + "ч");
                    m.put("creatorId", rs.getObject("creator_id"));
                    m.put("creator", rs.getString("creator_name"));
                    m.put("creatorRole", "manager");
                    m.put("creatorAvatar", rs.getString("creator_avatar") != null ? rs.getString("creator_avatar")
                            : "basic_avatar.png");
                    m.put("assigneeId", rs.getObject("assignee_id"));
                    m.put("assignee", rs.getString("assignee_name") != null ? rs.getString("assignee_name") : "-");
                    m.put("assigneeRole", "member");
                    m.put("assigneeAvatar", rs.getString("assignee_avatar"));
                    m.put("project", rs.getString("project_name"));
                    return m;
                });
    }

    @GetMapping("/api/tasks/assigned")
    public List<Map<String, Object>> assignedTasks() {
        Long uid = currentUserId();
        Long teamId = currentTeamId();
        ensureProjectTeamLinksForUserInTeam(uid, teamId);
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) {
            return List.of();
        }
        String projectArchive = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
        String projectsIn = inClauseSql(visibleIds);
        return jdbcTemplate.query(
                """
                        select
                            t.id, t.task_code, t.name, t.stage, t.priority, t.due_date, t.created_at, t.updated_at,
                            t.story_points, t.estimate_hours, t.assignee_id, t.creator_id,
                            coalesce(t.description, '') as description,
                            coalesce(p.project_type, 'list') as project_type,
                            """ + sqlPersonDisplayName("a") + """
                        as assignee_name,
                                           a.avatar_file as assignee_avatar,
                                           """ + sqlPersonDisplayName("c") + """
                        as creator_name,
                                           c.avatar_file as creator_avatar,
                                           p.name as project_name
                                       from task_item t
                                       join board b on b.id = t.board_id
                                       join project p on p.id = b.project_id
                                       left join app_user a on a.id = t.assignee_id
                                       left join app_user c on c.id = t.creator_id
                                       where p.id in ("""
                        + projectsIn
                        + ")"
                        + projectArchive
                        + """
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
                    m.put("taskDbId", rs.getLong("id"));
                    m.put("id",
                            rs.getString("task_code") != null ? rs.getString("task_code") : "TSK-" + rs.getLong("id"));
                    m.put("name", rs.getString("name"));
                    m.put("stage", stage);
                    m.put("description", rs.getString("description"));
                    m.put("projectType", rs.getString("project_type"));
                    m.put("status", toLegacyStatus(stage));
                    m.put("dueDate", dueDate);
                    m.put("completedDate", null);
                    m.put("priority", rs.getString("priority"));
                    m.put("createdDate", toUiDate(rs.getDate("created_at")));
                    m.put("complexity", rs.getObject("story_points") != null ? rs.getInt("story_points") : 3);
                    m.put("storyPoints", rs.getObject("story_points") != null ? rs.getInt("story_points") : null);
                    String estimate = rs.getObject("estimate_hours") != null
                            ? formatEstimateHours(rs.getBigDecimal("estimate_hours"))
                            : "8";
                    m.put("timeEstimate", estimate + "ч");
                    m.put("creatorId", rs.getObject("creator_id"));
                    m.put("creator", rs.getString("creator_name"));
                    m.put("creatorRole", "manager");
                    m.put("creatorAvatar", rs.getString("creator_avatar") != null ? rs.getString("creator_avatar")
                            : "basic_avatar.png");
                    m.put("assigneeId", rs.getObject("assignee_id"));
                    m.put("assignee", rs.getString("assignee_name") != null ? rs.getString("assignee_name") : "-");
                    m.put("assigneeRole", "member");
                    m.put("assigneeAvatar", rs.getString("assignee_avatar"));
                    m.put("project", rs.getString("project_name"));
                    return m;
                },
                uid);
    }

    @GetMapping("/api/tasks/filter-options")
    public Map<String, Object> tasksFilterOptions(@RequestParam(defaultValue = "all") String tab) {
        Long uid = currentUserId();
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("statuses", List.of());
            empty.put("priorities", List.of());
            empty.put("projects", List.of());
            empty.put("assignees", List.of());
            empty.put("creators", List.of());
            empty.put("maxComplexity", 13);
            return empty;
        }
        String visibleProjectsSql = inClauseSql(visibleIds);
        String tabFilter = tasksTabSqlFilter(tab, uid);
        String baseFrom = """
                from task_item t
                left join app_user a on a.id = t.assignee_id
                left join app_user c on c.id = t.creator_id
                left join board b on b.id = t.board_id
                left join project p on p.id = b.project_id
                where p.id in (""" + visibleProjectsSql + ") " + tabFilter;

        List<String> stages = jdbcTemplate.queryForList(
                "select distinct coalesce(t.stage, 'Новая') " + baseFrom + " order by 1",
                String.class);
        LinkedHashSet<String> statusCodes = new LinkedHashSet<>();
        for (String stage : stages) {
            statusCodes.add(toLegacyStatus(stage));
        }
        List<Map<String, String>> statuses = new ArrayList<>();
        for (String code : statusCodes) {
            Map<String, String> row = new LinkedHashMap<>();
            row.put("value", code);
            row.put("label", legacyStatusLabel(code));
            statuses.add(row);
        }

        List<Map<String, String>> priorities = jdbcTemplate.query(
                "select distinct t.priority " + baseFrom + " and t.priority is not null order by t.priority",
                (rs, rowNum) -> {
                    String p = rs.getString(1);
                    Map<String, String> row = new LinkedHashMap<>();
                    row.put("value", p);
                    row.put("label", priorityLabel(p));
                    return row;
                });

        List<Map<String, String>> projects = jdbcTemplate.query(
                "select distinct p.name " + baseFrom + " and p.name is not null order by p.name",
                (rs, rowNum) -> {
                    String name = rs.getString(1);
                    Map<String, String> row = new LinkedHashMap<>();
                    row.put("value", name);
                    row.put("label", name);
                    return row;
                });

        List<Map<String, String>> assignees = List.of();
        if (showAssigneeFilterForTab(tab)) {
            assignees = jdbcTemplate.query(
                    "select distinct " + sqlPersonDisplayName("a") + " as name " + baseFrom
                            + " and t.assignee_id is not null order by name",
                    (rs, rowNum) -> {
                        String name = rs.getString(1);
                        Map<String, String> row = new LinkedHashMap<>();
                        row.put("value", name);
                        row.put("label", name);
                        return row;
                    });
        }

        List<Map<String, String>> creators = List.of();
        if (showCreatorFilterForTab(tab)) {
            creators = jdbcTemplate.query(
                    "select distinct " + sqlPersonDisplayName("c") + " as name " + baseFrom
                            + " and t.creator_id is not null order by name",
                    (rs, rowNum) -> {
                        String name = rs.getString(1);
                        Map<String, String> row = new LinkedHashMap<>();
                        row.put("value", name);
                        row.put("label", name);
                        return row;
                    });
        }

        Integer maxSp = jdbcTemplate.queryForObject(
                "select coalesce(max(t.story_points), 13) " + baseFrom,
                Integer.class);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("statuses", statuses);
        out.put("priorities", priorities);
        out.put("projects", projects);
        out.put("assignees", assignees);
        out.put("creators", creators);
        out.put("maxComplexity", maxSp == null ? 13 : Math.max(1, maxSp));
        return out;
    }

    private String tasksTabSqlFilter(String tab, Long uid) {
        if (tab == null || tab.isBlank())
            tab = "all";
        return switch (tab) {
            case "assigned" -> " and t.assignee_id = " + uid + " and coalesce(t.stage, 'Очередь') <> 'Готово' ";
            case "deadline" -> """
                     and coalesce(t.stage, '') <> 'Готово'
                     and t.due_date is not null
                     and t.due_date >= current_date
                     and t.due_date <= current_date + interval '3 days'
                    """;
            case "todo" -> " and t.assignee_id is null ";
            case "created" -> " and t.creator_id = " + uid + " ";
            default -> "";
        };
    }

    private boolean showAssigneeFilterForTab(String tab) {
        return tab != null && !tab.equals("assigned") && !tab.equals("created");
    }

    private boolean showCreatorFilterForTab(String tab) {
        return tab != null && !tab.equals("created");
    }

    private String legacyStatusLabel(String code) {
        return switch (code) {
            case "inprocess" -> "В работе";
            case "done" -> "Завершено";
            case "exit" -> "Отложено";
            default -> "Назначена";
        };
    }

    private String priorityLabel(String priority) {
        if (priority == null)
            return "";
        return switch (priority) {
            case "срочно" -> "Срочно";
            case "обычный" -> "Обычный";
            default -> priority;
        };
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> projects(@RequestParam(defaultValue = "team") String scope,
            @RequestParam(defaultValue = "false") boolean archived) {
        Long teamId = currentTeamId();
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) {
            visibleIds = visibleProjectIdsSafe();
        }
        if (visibleIds.isEmpty()) {
            return List.of();
        }
        String inSql = inClauseSql(visibleIds);

        boolean hasProjectArchived = hasColumn("project", "archived_at");
        boolean hasProjectCode = hasColumn("project", "code");
        boolean hasProjectSummary = hasColumn("project", "summary");
        boolean hasProjectType = hasColumn("project", "project_type");
        boolean hasProjectOrg = hasColumn("project", "organization_id");
        boolean hasTeamName = hasColumn("app_team", "name");

        if (archived && !hasProjectArchived)
            return List.of();

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
                : "cast('-' as text)";

        List<Object> params = new ArrayList<>();
        if (hasTeamName)
            params.add(teamId);
        if ("organization".equalsIgnoreCase(scope) && hasProjectOrg)
            params.add(teamId);

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
                    if (archived) {
                        row.put("statusLabel", "Архивировано");
                    } else {
                        int done = rs.getInt("done_count");
                        row.put("statusLabel", done > 0 ? "Активен" : "Новый");
                    }
                    return row;
                },
                params.toArray());

        LinkedHashMap<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long id = ((Number) row.get("id")).longValue();
            byId.putIfAbsent(id, row);
        }
        return byId.values().stream()
                .filter(r -> r.get("code") != null && !String.valueOf(r.get("code")).isBlank())
                .toList();
    }

    @GetMapping("/api/projects/archived")
    public List<Map<String, Object>> archivedProjects(@RequestParam(defaultValue = "team") String scope) {
        return projects(scope, true);
    }

    @PostMapping("/api/projects/archive")
    public Map<String, Object> archiveProject(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null
                : String.valueOf(payload.get("projectCode")).trim();
        if (projectCode == null || projectCode.isBlank())
            throw new IllegalArgumentException("projectCode обязателен");
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        int updated = jdbcTemplate.update(
                """
                        update project p
                        set archived_at = now(), archived_by = ?
                        where p.code = ?
                          and p.id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                uid, projectCode, teamId);
        if (updated == 0)
            throw new IllegalArgumentException("Проект не найден");
        jdbcTemplate.update(
                """
                        update board b
                        set archived_at = now(), archived_by = ?
                        where b.project_id = (select p.id from project p where p.code = ?)
                        """,
                uid, projectCode);
        return Map.of("ok", true);
    }

    @PostMapping("/api/projects/restore")
    public Map<String, Object> restoreProject(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null
                : String.valueOf(payload.get("projectCode")).trim();
        if (projectCode == null || projectCode.isBlank())
            throw new IllegalArgumentException("projectCode обязателен");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                        update project p
                        set archived_at = null, archived_by = null
                        where p.code = ?
                          and p.id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                projectCode, teamId);
        if (updated == 0)
            throw new IllegalArgumentException("Проект не найден");
        jdbcTemplate.update(
                """
                        update board b
                        set archived_at = null, archived_by = null
                        where b.project_id = (select p.id from project p where p.code = ?)
                        """,
                projectCode);
        return Map.of("ok", true);
    }

    @Transactional
    public Map<String, Object> createProject(Map<String, Object> payload) {
        String name = payload.get("name") == null ? "" : String.valueOf(payload.get("name")).trim();
        if (name.isBlank()) {
            throw new IllegalArgumentException("Название проекта обязательно");
        }
        if (name.length() > 150) {
            throw new IllegalArgumentException("Название не длиннее 150 символов");
        }
        String summary = payload.get("summary") == null ? "" : String.valueOf(payload.get("summary")).trim();
        if (summary.length() > 4000) {
            throw new IllegalArgumentException("Описание слишком длинное");
        }
        String projectType = normalizeCreateProjectType(payload.get("projectType"));
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        Map<String, Object> teamRow = jdbcTemplate.queryForMap(
                "select organization_id from app_team where id = ?",
                teamId);
        String orgId = String.valueOf(teamRow.get("organization_id")).trim();

        String projectCode;
        Object codeRaw = payload.get("code");
        if (codeRaw != null) {
            String c = String.valueOf(codeRaw).trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z]", "");
            if (!c.isBlank()) {
                if (c.length() != 3) {
                    throw new IllegalArgumentException("Код проекта - ровно 3 латинские буквы A–Z");
                }
                int taken = jdbcTemplate.queryForObject(
                        "select count(*) from project where organization_id = ? and code = ?",
                        Integer.class,
                        orgId,
                        c);
                if (taken > 0) {
                    throw new IllegalArgumentException("Проект с таким кодом уже существует");
                }
                projectCode = c;
            } else {
                projectCode = allocateProjectCode(orgId, name);
            }
        } else {
            projectCode = allocateProjectCode(orgId, name);
        }

        jdbcTemplate.update(
                """
                        insert into project(name, owner_id, organization_id, code, summary, project_type)
                        values (?, ?, ?, ?, ?, ?)
                        """,
                name,
                uid,
                orgId,
                projectCode,
                summary,
                projectType);
        Long projectId = jdbcTemplate.queryForObject(
                "select id from project where organization_id = ? and code = ?",
                Long.class,
                orgId,
                projectCode);

        jdbcTemplate.update("insert into project_team(project_id, team_id) values (?, ?)", projectId, teamId);
        jdbcTemplate.update(
                "insert into project_member(project_id, user_id, role) values (?, ?, 'owner')",
                projectId,
                uid);
        jdbcTemplate.update(
                """
                        insert into app_user_role(user_id, role_code, organization_id, team_id, project_id)
                        values (?, 'project_admin', ?, ?, ?)
                        """,
                uid,
                orgId,
                teamId,
                projectId);

        createDefaultProjectBoard(projectId, projectType);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("projectCode", projectCode);
        out.put("projectId", projectId);
        return out;
    }

    private String normalizeCreateProjectType(Object raw) {
        if (raw == null) {
            return "list";
        }
        String t = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        return switch (t) {
            case "kanban", "scrum", "list" -> t;
            case "scrumban" -> "scrum";
            default -> "list";
        };
    }

    private String allocateProjectCode(String orgId, String projectName) {
        String candidate = toProjectCodeFromName(projectName);
        while (jdbcTemplate.queryForObject(
                "select count(*) from project where organization_id = ? and code = ?",
                Integer.class,
                orgId,
                candidate) > 0) {
            candidate = randomLetters(3);
        }
        return candidate;
    }

    private static String randomLetters(int len) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        ThreadLocalRandom r = ThreadLocalRandom.current();
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    private static String toProjectCodeFromName(String projectName) {
        if (projectName == null) {
            return randomLetters(3);
        }
        String src = projectName.trim();
        if (src.isEmpty()) {
            return randomLetters(3);
        }

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

    private void createDefaultProjectBoard(Long projectId, String projectType) {
        String boardCodePrefix = "list".equals(projectType) ? "LIST" : "KANBAN";
        String boardName = "Название доски";
        String boardCode = boardCodePrefix + "_1";
        jdbcTemplate.update(
                """
                        insert into board(name, project_id, code, created_at, archived_at, archived_by, position_no)
                        values (?, ?, ?, now(), null, null, 1)
                        """,
                boardName,
                projectId,
                boardCode);
        Long boardId = jdbcTemplate.queryForObject(
                "select id from board where project_id = ? and code = ?",
                Long.class,
                projectId,
                boardCode);
        List<String> stages = loadDefaultBoardStages(projectType, boardName);
        if (stages.isEmpty()) {
            stages = new ArrayList<>(List.of("Очередь", "В работе", "Готово"));
        }
        LinkedHashMap<String, Boolean> seen = new LinkedHashMap<>();
        List<String> uniqueStages = new ArrayList<>();
        for (String s : stages) {
            if (s == null || s.isBlank())
                continue;
            String key = s.trim();
            if (Boolean.TRUE.equals(seen.putIfAbsent(key, Boolean.TRUE))) {
                continue;
            }
            uniqueStages.add(key);
        }
        if (uniqueStages.isEmpty()) {
            uniqueStages = new ArrayList<>(List.of("Очередь", "В работе", "Готово"));
        }
        for (int i = 0; i < uniqueStages.size(); i++) {
            jdbcTemplate.update(
                    "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                    boardId,
                    uniqueStages.get(i),
                    i + 1);
        }
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
                teamId, projectCode);
    }

    @PostMapping("/api/boards/create")
    public Map<String, Object> createBoard(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null
                : String.valueOf(payload.get("projectCode")).trim();
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
                teamId, projectCode);
        Long projectId = ((Number) prj.get("id")).longValue();
        String projectType = String.valueOf(prj.get("project_type"));
        boolean isKanban = "kanban".equals(view) || "kanban".equals(projectType) || "scrum".equals(projectType);
        String prefix;
        if ("scrum".equals(view) || "scrum".equals(projectType))
            prefix = "SCRUM";
        else
            prefix = isKanban ? "KANBAN" : "LIST";
        Integer nextNo = jdbcTemplate.queryForObject(
                """
                        select coalesce(max((nullif(regexp_replace(coalesce(code,''), '[^0-9]', '', 'g'), ''))::int),0) + 1
                        from board
                        where project_id = ?
                          and code like ?
                        """,
                Integer.class,
                projectId, prefix + "%");
        String boardCode = prefix + "_" + nextNo;
        Integer nextPos = jdbcTemplate.queryForObject(
                "select coalesce(max(position_no),0)+1 from board where project_id = ?",
                Integer.class,
                projectId);
        jdbcTemplate.update(
                """
                        insert into board(name, project_id, code, created_at, archived_at, archived_by, position_no)
                        values (?, ?, ?, now(), null, null, ?)
                        """,
                name, projectId, boardCode, nextPos);
        Long boardId = jdbcTemplate.queryForObject(
                "select id from board where project_id = ? and code = ? order by id desc limit 1",
                Long.class,
                projectId, boardCode);
        if (isKanban) {
            List<String> stages = loadDefaultBoardStages(projectType, name);
            for (int i = 0; i < stages.size(); i++) {
                jdbcTemplate.update(
                        "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                        boardId, stages.get(i), i + 1);
            }
        }
        return Map.of("ok", true, "boardId", boardId, "boardCode", boardCode);
    }

    private Long requireBoardId(Map<String, Object> payload) {
        Object v = payload.get("boardId");
        if (v instanceof Number n) {
            return n.longValue();
        }
        if (v instanceof String s) {
            String t = s.trim();
            if (!t.isEmpty()) {
                try {
                    return Long.parseLong(t);
                } catch (NumberFormatException ignored) {
                }
            }
        }
        throw new IllegalArgumentException("boardId обязателен");
    }

    private static final Pattern SPRINT_TITLE_NUM_RU = Pattern.compile("(?iU)спринт\\s*№?\\s*(\\d+)");
    private static final Pattern SPRINT_TITLE_NUM_EN = Pattern.compile("(?iU)sprint\\s*#?\\s*(\\d+)");

    private static final String SCRUM_LIKE_PROJECT = " p.project_type = 'scrum'";

    private long requireScrumProjectIdForBoard(long boardId, long teamId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                            select b.project_id
                            from board b
                            where b.id = ?
                              and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                              and exists (select 1 from project p where p.id = b.project_id and """
                            + SCRUM_LIKE_PROJECT
                            + ") ",
                    Long.class,
                    boardId,
                    teamId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new IllegalArgumentException("Scrum-доска не найдена или нет доступа");
        }
    }

    private static String normStageSql(String col) {
        return "lower(regexp_replace(replace(btrim(coalesce(" + col
                + ", '')), chr(160), ' '), '[[:space:]]+', ' ', 'g'))";
    }

    private int shiftScrumBacklogBucketsForProject(long projectId) {
        String n = normStageSql("t.stage");
        String sql = "update task_item t set stage = case "
                + "when " + n
                + " in ('следующий спринт', 'на уточнении', 'готовность к планированию', 'кандидаты в спринт', "
                + "'планирование спринта') then 'Очередь' "
                + "when " + n + " = 'через 2 спринта' then 'Следующий спринт' "
                + "when " + n + " in ('через 3+ спринта', 'через 3 спринта', 'задачи на несколько спринтов вперед', "
                + "'отдалённый горизонт', 'отдаленный горизонт') then 'Через 2 спринта' "
                + "when (" + n + " like 'следующий%сприн%' or (" + n + " like '%следующ%' and " + n
                + " like '%сприн%')) "
                + "and " + n + " not like '%через 2%' and " + n + " not like '%через 3%' and " + n
                + " not like '%через%сприн%вперед%' "
                + "and " + n + " not like '%вперед%' then 'Очередь' "
                + "else t.stage end "
                + "where t.board_id in (select b.id from board b where b.project_id = ?) and ("
                + n
                + " in ('следующий спринт', 'на уточнении', 'готовность к планированию', 'кандидаты в спринт', 'планирование спринта', "
                + "'через 2 спринта', 'через 3+ спринта', 'через 3 спринта', 'задачи на несколько спринтов вперед', "
                + "'отдалённый горизонт', 'отдаленный горизонт') or ("
                + "(" + n + " like 'следующий%сприн%' or (" + n + " like '%следующ%' and " + n + " like '%сприн%')) "
                + "and " + n + " not like '%через 2%' and " + n + " not like '%через 3%' and " + n
                + " not like '%через%сприн%вперед%' "
                + "and " + n + " not like '%вперед%'))";
        return jdbcTemplate.update(sql, projectId);
    }

    private static Object mapGetCi(Map<String, Object> row, String logicalName) {
        if (row == null || logicalName == null) {
            return null;
        }
        for (Map.Entry<String, Object> e : row.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(logicalName)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static int maxSprintNumberInBoardNames(List<Map<String, Object>> rows) {
        int maxNum = 0;
        for (Map<String, Object> r : rows) {
            String nm = r.get("name") == null ? "" : String.valueOf(r.get("name"));
            nm = nm.replace('\u00A0', ' ').replace('\u202F', ' ');
            for (Pattern p : List.of(SPRINT_TITLE_NUM_RU, SPRINT_TITLE_NUM_EN)) {
                Matcher m = p.matcher(nm);
                if (m.find()) {
                    try {
                        maxNum = Math.max(maxNum, Integer.parseInt(m.group(1)));
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
        }
        return maxNum;
    }

    private int renameSprintBoardsForStartedSprint(long projectId, long teamId, boolean incrementAfterCompletedSprint) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        select b.name
                        from board b
                        join project p on p.id = b.project_id
                        where b.project_id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                          and p.project_type = 'scrum'
                        """,
                projectId,
                teamId);
        int maxNum = maxSprintNumberInBoardNames(rows);
        if (incrementAfterCompletedSprint && maxNum == 0) {
            maxNum = 1;
        }
        int newNum = incrementAfterCompletedSprint ? maxNum + 1 : Math.max(maxNum, 1);
        return jdbcTemplate.update(
                """
                        update board b
                        set name = ?
                        from project p
                        where p.id = b.project_id
                          and b.project_id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                          and p.project_type = 'scrum'
                        """,
                "Спринт " + newNum,
                projectId,
                teamId);
    }

    @PostMapping("/api/scrum/sprints/start")
    public Map<String, Object> startSprint(@RequestBody Map<String, Object> payload) {
        Long boardId = requireBoardId(payload);
        Long teamId = currentTeamId();
        long projectId = requireScrumProjectIdForBoard(boardId, teamId);
        boolean hasSprintStartedAt = hasColumn("board", "sprint_started_at");
        boolean hasSprintFinishedAt = hasColumn("board", "sprint_finished_at");
        boolean sprintColumns = hasSprintStartedAt && hasSprintFinishedAt;

        Map<String, Object> cur;
        if (sprintColumns) {
            try {
                cur = jdbcTemplate.queryForMap(
                        """
                                select b.sprint_started_at, b.sprint_finished_at
                                from board b
                                where b.id = ?
                                  and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                                  and exists (select 1 from project p where p.id = b.project_id and """
                                + SCRUM_LIKE_PROJECT
                                + ") ",
                        boardId,
                        teamId);
            } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
                throw new IllegalArgumentException("Scrum-доска не найдена или нет доступа");
            }
        } else {
            cur = Map.of("sprint_started_at", null, "sprint_finished_at", null);
        }
        Object startedRaw = mapGetCi(cur, "sprint_started_at");
        Object finishedRaw = mapGetCi(cur, "sprint_finished_at");
        boolean active = startedRaw != null && finishedRaw == null;
        boolean needsBacklogShift = !active;

        boolean incrementSprintTitle = false;
        if (sprintColumns) {
            Long finishedBoards = jdbcTemplate.queryForObject(
                    """
                            select count(*) from board b
                            join project p on p.id = b.project_id
                            where b.project_id = ?
                              and b.sprint_finished_at is not null
                              and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                              and p.project_type = 'scrum'
                            """,
                    Long.class,
                    projectId,
                    teamId);
            incrementSprintTitle = (finishedBoards != null && finishedBoards > 0L) || (finishedRaw != null);
        }

        String sprintSql;
        if (sprintColumns) {
            sprintSql = """
                    update board b
                    set sprint_started_at = coalesce(sprint_started_at, now()),
                        sprint_finished_at = null
                    where b.project_id = ?
                      and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                      and exists (select 1 from project p where p.id = b.project_id and """
                    + SCRUM_LIKE_PROJECT
                    + ") ";
        } else {
            sprintSql = """
                    update board b
                    set name = b.name
                    where b.project_id = ?
                      and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                      and exists (select 1 from project p where p.id = b.project_id and """
                    + SCRUM_LIKE_PROJECT
                    + ") ";
        }
        int updated = jdbcTemplate.update(sprintSql, projectId, teamId);
        if (updated == 0) {
            throw new IllegalArgumentException("Scrum-доска не найдена или нет доступа");
        }

        int bucketShifted = 0;
        if (needsBacklogShift) {
            bucketShifted = shiftScrumBacklogBucketsForProject(projectId);
            renameSprintBoardsForStartedSprint(projectId, teamId, incrementSprintTitle);
        }

        Long backlogCount = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from task_item t
                        join board b on b.id = t.board_id
                        where b.project_id = ?
                          and btrim(coalesce(t.stage, '')) in (
                            'Новые задачи', 'Следующий спринт', 'Через 2 спринта', 'Через 3+ спринта', 'Отложено',
                            'Неотсортированные задачи', 'На уточнении', 'Готовность к планированию', 'Кандидаты в спринт',
                            'Задачи на несколько спринтов вперед'
                          )
                        """,
                Long.class,
                projectId);
        if (needsBacklogShift && (backlogCount == null || backlogCount == 0L)) {
            Long creatorId = currentUserId();
            Long assigneeId = creatorId;
            List<Map<String, String>> seeds = List.of(
                    Map.of("name", "Уточнить критерии приёмки для пользовательских историй", "stage", "Новые задачи"),
                    Map.of("name", "Подготовить задачи для следующего планирования спринта", "stage",
                            "Следующий спринт"),
                    Map.of("name", "Сверить технические зависимости со смежной командой", "stage", "Через 2 спринта"),
                    Map.of("name", "Сформировать идеи улучшений для будущих релизов", "stage", "Через 3+ спринта"),
                    Map.of("name", "Вернуться к задаче после стабилизации текущего релиза", "stage", "Отложено"));
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
                        creatorId);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("needsBacklogShift", needsBacklogShift);
        out.put("backlogTasksUpdated", bucketShifted);
        if (sprintColumns) {
            try {
                Map<String, Object> row = jdbcTemplate.queryForMap(
                        "select sprint_started_at, sprint_finished_at from board where id = ?",
                        boardId);
                out.put("sprintStartedAt", toIsoDateTime(row.get("sprint_started_at")));
                out.put("sprintFinishedAt", toIsoDateTime(row.get("sprint_finished_at")));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    @PostMapping("/api/scrum/sprints/finish")
    public Map<String, Object> finishSprint(@RequestBody Map<String, Object> payload) {
        Long boardId = requireBoardId(payload);
        Long teamId = currentTeamId();
        long projectId = requireScrumProjectIdForBoard(boardId, teamId);
        boolean hasSprintStartedAt = hasColumn("board", "sprint_started_at");
        boolean hasSprintFinishedAt = hasColumn("board", "sprint_finished_at");
        boolean sprintColumns = hasSprintStartedAt && hasSprintFinishedAt;

        if (sprintColumns) {
            Long activeCount = jdbcTemplate.queryForObject(
                    """
                            select count(*) from board b
                            where b.project_id = ?
                              and b.sprint_started_at is not null
                              and b.sprint_finished_at is null
                            """,
                    Long.class,
                    projectId);
            if (activeCount == null || activeCount == 0L) {
                throw new IllegalArgumentException("Спринт не запущен или уже завершён");
            }
        }

        String sprintSql;
        if (sprintColumns) {
            sprintSql = """
                    update board b
                    set sprint_started_at = coalesce(sprint_started_at, now()),
                        sprint_finished_at = now()
                    where b.project_id = ?
                      and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                      and exists (select 1 from project p where p.id = b.project_id and """
                    + SCRUM_LIKE_PROJECT
                    + ") ";
        } else {
            sprintSql = """
                    update board b
                    set name = b.name
                    where b.project_id = ?
                      and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                      and exists (select 1 from project p where p.id = b.project_id and """
                    + SCRUM_LIKE_PROJECT
                    + ") ";
        }
        int updated = jdbcTemplate.update(sprintSql, projectId, teamId);
        if (updated == 0) {
            throw new IllegalArgumentException("Scrum-доска не найдена или нет доступа");
        }
        if (sprintColumns) {
            jdbcTemplate.update(
                    """
                            update task_item t
                            set stage = 'Следующий спринт'
                            where t.board_id in (select b.id from board b where b.project_id = ?)
                              and btrim(coalesce(t.stage, '')) in ('Очередь', 'В работе', 'Тестирование')
                            """,
                    projectId);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        if (sprintColumns) {
            try {
                Map<String, Object> row = jdbcTemplate.queryForMap(
                        "select sprint_started_at, sprint_finished_at from board where id = ?",
                        boardId);
                out.put("sprintStartedAt", toIsoDateTime(row.get("sprint_started_at")));
                out.put("sprintFinishedAt", toIsoDateTime(row.get("sprint_finished_at")));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    @PostMapping("/api/scrum/boards/consolidate")
    public Map<String, Object> consolidateScrumBoards(@RequestBody Map<String, Object> payload) {
        String projectCode = payload.get("projectCode") == null ? null
                : String.valueOf(payload.get("projectCode")).trim();
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
                          and ("""
                        + SCRUM_LIKE_PROJECT
                        + """
                                )
                                order by b.id
                                """,
                teamId, projectCode, projectCode, projectCode);
        if (boards.size() <= 1)
            return Map.of("ok", true, "movedBoards", 0);

        Map<String, Object> primary = null;
        for (Map<String, Object> b : boards) {
            if (b.get("sprint_started_at") != null && b.get("sprint_finished_at") == null) {
                primary = b;
                break;
            }
        }
        if (primary == null)
            primary = boards.get(0);
        Long primaryBoardId = ((Number) primary.get("id")).longValue();
        String primaryName = String.valueOf(primary.get("name"));
        Integer sprintNum = null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)спринт\\s*(\\d+)").matcher(primaryName);
        if (m.find()) {
            try {
                sprintNum = Integer.parseInt(m.group(1));
            } catch (Exception ignored) {
            }
        }
        if (sprintNum == null) {
            int maxNum = 0;
            for (Map<String, Object> b : boards) {
                String nm = String.valueOf(b.get("name"));
                java.util.regex.Matcher mm = java.util.regex.Pattern.compile("(?i)спринт\\s*(\\d+)").matcher(nm);
                if (mm.find()) {
                    try {
                        maxNum = Math.max(maxNum, Integer.parseInt(mm.group(1)));
                    } catch (Exception ignored) {
                    }
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
            if (bid.equals(primaryBoardId))
                continue;
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
        if (boardIdNum == null || name == null || name.isBlank())
            throw new IllegalArgumentException("boardId и name обязательны");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                        update board b
                        set name = ?
                        where b.id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                name, boardIdNum.longValue(), teamId);
        if (updated == 0)
            throw new IllegalArgumentException("Доска не найдена");
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/archive")
    public Map<String, Object> archiveBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null)
            throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        int updated = jdbcTemplate.update(
                """
                        update board b
                        set archived_at = now(), archived_by = ?
                        where b.id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                uid, boardIdNum.longValue(), teamId);
        if (updated == 0)
            throw new IllegalArgumentException("Доска не найдена");
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/restore")
    public Map<String, Object> restoreBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        boolean withTasks = payload.get("withTasks") == null
                || Boolean.parseBoolean(String.valueOf(payload.get("withTasks")));
        if (boardIdNum == null)
            throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        int updated = jdbcTemplate.update(
                """
                        update board b
                        set archived_at = null, archived_by = null
                        where b.id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                boardIdNum.longValue(), teamId);
        if (updated == 0)
            throw new IllegalArgumentException("Доска не найдена");
        if (!withTasks) {
            jdbcTemplate.update("delete from task_item where board_id = ?", boardIdNum.longValue());
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/duplicate")
    public Map<String, Object> duplicateBoard(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null)
            throw new IllegalArgumentException("boardId обязателен");
        Long teamId = currentTeamId();
        Map<String, Object> src = jdbcTemplate.queryForMap(
                """
                        select b.id, b.name, b.project_id, b.code
                        from board b
                        where b.id = ?
                          and b.project_id in (select pt.project_id from project_team pt where pt.team_id = ?)
                        """,
                boardIdNum.longValue(), teamId);
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
                projectId, prefix + "%");
        String newCode = prefix + "_" + nextNo;
        Integer nextPos = jdbcTemplate.queryForObject(
                "select coalesce(max(position_no),0)+1 from board where project_id = ?",
                Integer.class,
                projectId);
        jdbcTemplate.update(
                "insert into board(name, project_id, code, created_at, position_no) values (?, ?, ?, now(), ?)",
                String.valueOf(src.get("name")) + " (копия)", projectId, newCode, nextPos);
        Long newBoardId = jdbcTemplate.queryForObject(
                "select id from board where project_id = ? and code = ? order by id desc limit 1",
                Long.class,
                projectId, newCode);
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select stage_name, position from board_stage where board_id = ? order by position",
                srcBoardId);
        for (Map<String, Object> s : stages) {
            jdbcTemplate.update(
                    "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                    newBoardId, String.valueOf(s.get("stage_name")), ((Number) s.get("position")).intValue());
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
                boardId, teamId);
        List<Map<String, Object>> tasks = jdbcTemplate.queryForList(
                """
                        select id, coalesce(public_id, task_code, 'TSK-'||id::text) as display_id, name, stage, priority
                        from task_item
                        where board_id = ?
                        order by id
                        """,
                boardId);
        return Map.of("board", board, "tasks", tasks);
    }

    @PostMapping("/api/boards/stages/add")
    public Map<String, Object> addBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        if (boardIdNum == null || stageName == null || stageName.isBlank())
            throw new IllegalArgumentException("boardId и stageName обязательны");
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
                boardIdNum.longValue(), teamId);
        jdbcTemplate.update("insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                boardIdNum.longValue(), stageName, nextPos);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/rename")
    public Map<String, Object> renameBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String oldName = payload.get("oldName") == null ? null : String.valueOf(payload.get("oldName")).trim();
        String newName = payload.get("newName") == null ? null : String.valueOf(payload.get("newName")).trim();
        if (boardIdNum == null || oldName == null || newName == null || newName.isBlank())
            throw new IllegalArgumentException("boardId, oldName, newName обязательны");
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
                newName, boardIdNum.longValue(), oldName, teamId);
        jdbcTemplate.update("update task_item set stage = ? where board_id = ? and stage = ?",
                newName, boardIdNum.longValue(), oldName);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/move")
    public Map<String, Object> moveBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        String direction = payload.get("direction") == null ? null : String.valueOf(payload.get("direction")).trim();
        if (boardIdNum == null || stageName == null || direction == null)
            throw new IllegalArgumentException("boardId, stageName, direction обязательны");
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select id, stage_name, position from board_stage where board_id = ? order by position",
                boardIdNum.longValue());
        int idx = -1;
        for (int i = 0; i < stages.size(); i++)
            if (stageName.equals(String.valueOf(stages.get(i).get("stage_name"))))
                idx = i;
        if (idx == -1)
            return Map.of("ok", true);
        int to = "up".equalsIgnoreCase(direction) ? idx - 1 : idx + 1;
        if (to < 0 || to >= stages.size())
            return Map.of("ok", true);
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
        if (boardIdNum == null || stageName == null)
            throw new IllegalArgumentException("boardId и stageName обязательны");
        String fallback = jdbcTemplate.query(
                "select stage_name from board_stage where board_id = ? order by position",
                (rs, rowNum) -> rs.getString(1),
                boardIdNum.longValue()).stream().filter(s -> "Очередь".equals(s)).findFirst().orElse("Очередь");
        jdbcTemplate.update("update task_item set stage = ? where board_id = ? and stage = ?",
                fallback, boardIdNum.longValue(), stageName);
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/delete")
    public Map<String, Object> deleteBoardStage(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        String stageName = payload.get("stageName") == null ? null : String.valueOf(payload.get("stageName")).trim();
        if (boardIdNum == null || stageName == null)
            throw new IllegalArgumentException("boardId и stageName обязательны");
        clearBoardStage(payload);
        jdbcTemplate.update("delete from board_stage where board_id = ? and stage_name = ?",
                boardIdNum.longValue(), stageName);
        List<Map<String, Object>> stages = jdbcTemplate.queryForList(
                "select id from board_stage where board_id = ? order by position, id",
                boardIdNum.longValue());
        for (int i = 0; i < stages.size(); i++) {
            jdbcTemplate.update("update board_stage set position = ? where id = ?", i + 1,
                    ((Number) stages.get(i).get("id")).longValue());
        }
        return Map.of("ok", true);
    }

    @PostMapping("/api/boards/stages/reset")
    public Map<String, Object> resetBoardStages(@RequestBody Map<String, Object> payload) {
        Number boardIdNum = payload.get("boardId") instanceof Number n ? n : null;
        if (boardIdNum == null)
            throw new IllegalArgumentException("boardId обязателен");
        jdbcTemplate.update("delete from board_stage where board_id = ?", boardIdNum.longValue());
        List<String> stages = List.of("Очередь", "В работе", "Готово");
        for (int i = 0; i < stages.size(); i++) {
            jdbcTemplate.update(
                    "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                    boardIdNum.longValue(), stages.get(i), i + 1);
        }
        return Map.of("ok", true);
    }

    @GetMapping("/api/task-form/options")
    public Map<String, Object> taskFormOptions(@RequestParam(required = false) String project,
            @RequestParam(required = false) String q) {
        List<Long> visibleIds = visibleProjectIds();
        if (visibleIds.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("projects", List.of());
            empty.put("assignees", List.of());
            empty.put("boards", List.of());
            empty.put("dependencies", List.of());
            return empty;
        }
        String visibleProjectsSql = inClauseSql(visibleIds);
        String query = q == null ? "" : q.trim().toLowerCase();
        boolean hasQ = !query.isBlank();
        String projectsSql = """
                select p.id, p.name, p.code, p.project_type
                from project p
                where p.id in (""" + visibleProjectsSql + """
                ) """ + (hasQ ? " and (lower(p.name) like ? or lower(trim(cast(p.code as text))) like ?) " : "") + """
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
                        teamId);

        String dependencySql = """
                select
                    t.id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                    t.name
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                where p.id in (""" + visibleProjectsSql + """
                ) """ + (project != null && !project.isBlank()
                ? " and lower(trim(cast(p.code as text))) = lower(trim(?)) "
                : "")
                + (hasQ ? " and (lower(t.name) like ? or lower(coalesce(t.public_id, t.task_code, '')) like ?) " : "")
                + """
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
                ) """ + (project != null && !project.isBlank()
                ? " and lower(trim(cast(p.code as text))) = lower(trim(?)) "
                : "")
                + (hasQ ? " and (lower(b.name) like ? or lower(p.name) like ? or lower(trim(cast(p.code as text))) like ?) "
                        : "")
                + """
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
    public Map<String, Object> indexSummary(HttpServletResponse httpResponse) {
        httpResponse.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        httpResponse.setHeader("Pragma", "no-cache");
        Long uid = currentUserId();
        Long teamId = currentTeamId();
        ensureProjectTeamLinksForUserInTeam(uid, teamId);
        String projectArchive = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
        String visibility = teamProjectVisibilitySql("p");
        List<Map<String, Object>> todo = jdbcTemplate.query(
                """
                        select
                            t.id as task_db_id,
                            coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as task_public_id,
                            t.name,
                            p.name as project_name,
                            trim(cast(p.code as text)) as project_code,
                            coalesce(p.project_type, 'list') as project_type,
                            coalesce(t.description, '') as description,
                            coalesce(t.stage, 'Очередь') as stage_name,
                            t.due_date,
                            t.priority
                        from task_item t
                        join board b on b.id = t.board_id
                        join project p on p.id = b.project_id
                        where t.assignee_id is null
                          and coalesce(t.stage, 'Очередь') <> 'Готово'
                          and """
                        + visibility
                        + projectArchive
                        + """
                                order by t.due_date nulls last, t.id
                                limit 10
                                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("taskDbId", rs.getLong("task_db_id"));
                    row.put("id", rs.getString("task_public_id"));
                    row.put("name", rs.getString("name"));
                    row.put("project", rs.getString("project_name"));
                    row.put("projectCode", rs.getString("project_code"));
                    row.put("projectType", rs.getString("project_type"));
                    row.put("description", rs.getString("description"));
                    row.put("stage", rs.getString("stage_name"));
                    row.put("dueDate", toUiDate(rs.getDate("due_date")));
                    row.put("priority", rs.getString("priority"));
                    return row;
                });

        Integer assigned = jdbcTemplate.queryForObject("select count(*) from task_item where assignee_id = ?",
                Integer.class, uid);
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
                        left join board b on b.project_id = p.id
                        left join task_item t on t.board_id = b.id
                        where """
                        + visibility
                        + projectArchive
                        + """
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
                });

        List<Map<String, Object>> team = jdbcTemplate.query(
                """
                        select
                            u.public_id,
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
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
                        order by case tm.role when 'lead' then 0 else 1 end, u.last_name, u.first_name
                        limit 5
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    putPersonNameFields(
                            row,
                            rs.getString("last_name"),
                            rs.getString("first_name"),
                            null);
                    row.put("name", row.get("fullName"));
                    row.put("publicId", rs.getString("public_id"));
                    row.put("role", rs.getString("role"));
                    row.put("avatar", rs.getString("avatar"));
                    row.put("online", rs.getBoolean("is_online") || rowNum < 3);
                    return row;
                },
                teamId);

        String recentHistFilter = hasColumn("task_status_history", "change_source")
                ? " and coalesce(h.change_source, 'user') <> 'sprint_auto' "
                : "";

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
                        left join app_user u on u.id = h.changed_by
                        where """
                        + visibility
                        + projectArchive
                        + recentHistFilter
                        + """
                                  and h.changed_at <= now()
                                  and (h.old_stage is null or trim(h.old_stage) = '' or h.old_stage <> h.new_stage)
                                order by h.changed_at desc, h.id desc
                                limit 5
                                """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("avatar", rs.getString("avatar"));
                    row.put("id", rs.getString("task_public_id"));
                    row.put("name", rs.getString("task_name"));
                    row.put("project", rs.getString("project_name"));
                    row.put("status", toLegacyStatus(rs.getString("new_stage")));
                    row.put("date", formatRecentActionTimestamp(rs.getTimestamp("changed_at")));
                    return row;
                });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("todo", todo);
        out.put("assigned", assigned == null ? 0 : assigned);
        out.put("inProgress", inProgress == null ? 0 : inProgress);
        out.put("done", done == null ? 0 : done);
        out.put("activeProjects", activeProjects);
        out.put("team", team);
        out.put("recentActions", recentActions);
        try {
            out.put("upcomingEvents", calendarEventService.upcoming(5));
        } catch (Exception ex) {
            out.put("upcomingEvents", List.of());
        }
        return out;
    }

    @GetMapping("/api/reports/projects")
    public Map<String, Object> projectReports(@RequestParam(defaultValue = "all") String mode) {
        String visibleProjectsSql = visibleProjectsInClause();
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
                        left join board b on b.project_id = p.id """
                        + boardCondition + """
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
                });

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
                        ((Number) a.get("overdue")).intValue() + ((Number) a.get("urgent")).intValue()))
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
                "overdue", totalOverdue));
        out.put("executive", Map.of(
                "doneRate", doneRate,
                "overdueRate", overdueRate,
                "health", health));
        out.put("topRisks", topRiskProjects);
        return out;
    }

    @GetMapping("/api/index/mini-chart")
    public Map<String, Object> miniChart() {
        Long uid = currentUserId();
        String visibleProjectsSql = visibleProjectsInClause();
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

    public Map<String, Object> analyticsDashboard(@RequestParam(defaultValue = "30") int period) {
        try {
            return analyticsDashboardService.build(currentTeamId(), visibleProjectIds(), period);
        } catch (DataAccessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Ошибка построения аналитики: "
                            + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName()));
        }
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

    private String formatRecentActionTimestamp(Timestamp ts) {
        if (ts == null) {
            return "";
        }
        ZoneId z = ZoneId.systemDefault();
        ZonedDateTime zdt = ts.toInstant().atZone(z);
        LocalDate day = zdt.toLocalDate();
        LocalDate today = LocalDate.now(z);
        String timePart = zdt.format(INDEX_RECENT_TIME);
        if (day.equals(today)) {
            return "Сегодня, " + timePart;
        }
        if (day.equals(today.minusDays(1))) {
            return "Вчера, " + timePart;
        }
        return zdt.format(INDEX_RECENT_FALLBACK);
    }

    private String toLegacyStatus(String stage) {
        if (stage == null)
            return "neutral";
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
                currentUsername());
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_user", Long.class);
    }

    public List<Long> visibleProjectIdsForContext() {
        return visibleProjectIds();
    }

    @GetMapping("/api/debug/context")
    public Map<String, Object> debugContext() {
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        String username = currentUsername();
        List<Long> visibleIds = visibleProjectIds();
        List<String> warnings = new ArrayList<>();

        Long teamIdFromUrl = contextTeamIdFromRequest();
        if (teamIdFromUrl != null && teamId != null && !teamIdFromUrl.equals(teamId)) {
            warnings.add("currentTeamId()=" + teamId + " не совпадает с team из URL/holder=" + teamIdFromUrl);
        }
        if (teamId == null) {
            warnings.add("currentTeamId() = null - контекст команды не определён");
        }

        String teamPublicId = null;
        String orgPublicId = null;
        if (teamId != null) {
            try {
                Map<String, Object> row = jdbcTemplate.queryForMap(
                        """
                                select trim(coalesce(t.public_id, '')) as team_public_id,
                                       trim(coalesce(org.public_id, '')) as org_public_id
                                from app_team t
                                join organization org on org.id = t.organization_id
                                where t.id = ?
                                """,
                        teamId);
                teamPublicId = String.valueOf(row.get("team_public_id"));
                orgPublicId = String.valueOf(row.get("org_public_id"));
            } catch (Exception ignored) {
            }
        }

        String requestUri = request != null ? request.getRequestURI() : "";
        String referer = request != null ? request.getHeader("Referer") : "";
        String holderTeam = TeamContextHolder.getTeamPublicId();

        int tasksTotal = jdbcTemplate.queryForObject("select count(*) from task_item", Integer.class);
        int tasksVisible = 0;
        if (!visibleIds.isEmpty()) {
            String inSql = inClauseSql(visibleIds);
            String archive = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
            tasksVisible = jdbcTemplate.queryForObject(
                    """
                            select count(*)
                            from task_item t
                            join board b on b.id = t.board_id
                            join project p on p.id = b.project_id
                            where p.id in (""" + inSql + ")" + archive,
                    Integer.class);
        }

        List<Map<String, Object>> visibleProjects = List.of();
        if (!visibleIds.isEmpty()) {
            String inSql = inClauseSql(visibleIds);
            visibleProjects = jdbcTemplate.query(
                    """
                            select p.id, trim(cast(p.code as text)) as code, p.name
                            from project p
                            where p.id in (""" + inSql + """
                            )
                            order by p.name
                            """,
                    (rs, rowNum) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", rs.getLong("id"));
                        m.put("code", rs.getString("code"));
                        m.put("name", rs.getString("name"));
                        return m;
                    });
        }

        List<Map<String, Object>> projectTeamLinks = teamId == null ? List.of()
                : jdbcTemplate.query(
                        """
                                select pt.project_id, pt.team_id, trim(cast(p.code as text)) as code, t.name as team_name
                                from project_team pt
                                join project p on p.id = pt.project_id
                                join app_team t on t.id = pt.team_id
                                where p.id in (select pm.project_id from project_member pm where pm.user_id = ?)
                                   or pt.team_id = ?
                                order by p.code, pt.team_id
                                """,
                        (rs, rowNum) -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("projectId", rs.getLong("project_id"));
                            m.put("teamId", rs.getLong("team_id"));
                            m.put("code", rs.getString("code"));
                            m.put("teamName", rs.getString("team_name"));
                            return m;
                        },
                        uid,
                        teamId);

        List<Map<String, Object>> tasksByProject = List.of();
        if (!visibleIds.isEmpty()) {
            String inSql = inClauseSql(visibleIds);
            String archive = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
            tasksByProject = jdbcTemplate.query(
                    """
                            select trim(cast(p.code as text)) as code, p.name, count(t.id) as task_count
                            from project p
                            left join board b on b.project_id = p.id
                            left join task_item t on t.board_id = b.id
                            where p.id in (""" + inSql + ")" + archive + """
                            group by p.id, p.code, p.name
                            order by task_count desc, p.name
                            """,
                    (rs, rowNum) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("code", rs.getString("code"));
                        m.put("name", rs.getString("name"));
                        m.put("taskCount", rs.getInt("task_count"));
                        return m;
                    });
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestUri", requestUri);
        out.put("referer", referer);
        out.put("holderTeamPublicId", holderTeam);
        out.put("teamId", teamId);
        out.put("teamIdFromUrl", teamIdFromUrl);
        out.put("teamPublicId", teamPublicId);
        out.put("orgPublicId", orgPublicId);
        out.put("userId", uid);
        out.put("username", username);
        out.put("visibleProjectCount", visibleIds.size());
        out.put("visibleProjects", visibleProjects);
        out.put("projectTeamLinks", projectTeamLinks);
        out.put("tasksVisibleCount", tasksVisible);
        out.put("tasksTotalCount", tasksTotal);
        out.put("tasksByProject", tasksByProject);
        out.put("warnings", warnings);
        return out;
    }

    private Long currentTeamId() {
        Long contextTeam = contextTeamIdFromRequest();
        if (contextTeam != null) {
            return contextTeam;
        }
        Optional<String[]> ctx = resolveTeamContextFromRequest();
        if (ctx.isPresent()) {
            Long fromUrl = resolveTeamIdByPublicId(ctx.get()[1]);
            if (fromUrl != null) {
                return fromUrl;
            }
        }
        Long uid = currentUserId();
        List<Long> ids = jdbcTemplate.query(
                "select team_id from team_membership where user_id = ? order by team_id limit 1",
                (rs, rowNum) -> rs.getLong("team_id"),
                uid);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_team", Long.class);
    }

    private Long resolveTeamIdByPublicId(String teamPublicId) {
        if (teamPublicId == null || teamPublicId.isBlank()) {
            return null;
        }
        List<Long> ids = jdbcTemplate.query(
                "select id from app_team where lower(trim(cast(public_id as text))) = lower(trim(?)) order by id desc limit 1",
                (rs, rowNum) -> rs.getLong("id"),
                TeamContextSupport.normalizePublicId(teamPublicId));
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long resolveTeamIdForAccessibleTask(Long taskId, Long userId) {
        if (taskId == null || taskId <= 0 || userId == null) {
            return null;
        }
        Long preferred = contextTeamIdFromRequest();
        if (preferred == null) {
            Optional<String[]> ctx = resolveTeamContextFromRequest();
            if (ctx.isPresent()) {
                preferred = resolveTeamIdByPublicId(ctx.get()[1]);
            }
        }
        final long preferredOrderKey = preferred != null ? preferred : -1L;
        List<Long> ids = jdbcTemplate.query(
                """
                        select pt.team_id
                        from task_item t
                        join board b on b.id = t.board_id
                        join project p on p.id = b.project_id
                        join project_team pt on pt.project_id = p.id
                        join team_membership tm on tm.team_id = pt.team_id and tm.user_id = ?
                        where t.id = ?
                        order by case when pt.team_id = ? then 0 else pt.team_id end
                        limit 1
                        """,
                (rs, rowNum) -> rs.getLong("team_id"),
                userId, taskId, preferredOrderKey);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Optional<String[]> resolveTeamContextFromRequest() {
        if (request == null) {
            return Optional.empty();
        }
        List<String> sources = new ArrayList<>();
        String uri = request.getRequestURI();
        if (uri != null && !uri.isBlank()) {
            sources.add(uri);
        }
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            sources.add(referer);
        }
        for (String src : sources) {
            Matcher matcher = TEAM_CONTEXT_PATH.matcher(src);
            if (matcher.find()) {
                return Optional.of(new String[] { matcher.group(1), matcher.group(2) });
            }
        }
        return Optional.empty();
    }

    private Long contextTeamIdFromRequest() {
        try {
            String heldTeam = TeamContextHolder.getTeamPublicId();
            if (heldTeam != null && !heldTeam.isBlank()) {
                Long fromHolder = resolveTeamIdByPublicId(heldTeam);
                if (fromHolder != null) {
                    return fromHolder;
                }
            }
            if (request != null) {
                @SuppressWarnings("unchecked")
                Map<String, String> pathVars = (Map<String, String>) request.getAttribute(
                        HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
                if (pathVars != null) {
                    String teamPublicId = pathVars.get("teamId");
                    Long fromPathVar = resolveTeamIdByPublicId(teamPublicId);
                    if (fromPathVar != null) {
                        return fromPathVar;
                    }
                }
            }
            Optional<String[]> contextIds = resolveTeamContextFromRequest();
            if (contextIds.isEmpty()) {
                return null;
            }
            return resolveTeamIdByPublicId(contextIds.get()[1]);
        } catch (Exception ignored) {
            return null;
        }
    }

    private void ensureProjectTeamLinksForUserInTeam(Long userId, Long teamId) {
        if (userId == null || teamId == null) {
            return;
        }
        jdbcTemplate.update(
                """
                        insert into project_team (project_id, team_id)
                        select distinct aur.project_id, aur.team_id
                        from app_user_role aur
                        where aur.user_id = ?
                          and aur.team_id = ?
                          and aur.project_id is not null
                          and aur.role_code = 'project_admin'
                          and not exists (
                            select 1 from project_team pt
                            where pt.project_id = aur.project_id and pt.team_id = aur.team_id
                          )
                        """,
                userId, teamId);
        jdbcTemplate.update(
                """
                        insert into project_team (project_id, team_id)
                        select distinct pm.project_id, ?
                        from project_member pm
                        join project p on p.id = pm.project_id
                        join app_team t on t.id = ?
                        where pm.user_id = ?
                          and pm.role = 'owner'
                          and p.organization_id is not distinct from t.organization_id
                          and not exists (
                            select 1 from project_team pt
                            where pt.project_id = pm.project_id and pt.team_id = ?
                          )
                        """,
                teamId, teamId, userId, teamId);
        jdbcTemplate.update(
                """
                        insert into project_team (project_id, team_id)
                        select distinct pm.project_id, ?
                        from project_member pm
                        join project p on p.id = pm.project_id
                        join app_team t on t.id = ?
                        where pm.user_id = ?
                          and p.organization_id is not distinct from t.organization_id
                          and not exists (
                            select 1
                            from project_team pt
                            join app_team t2 on t2.id = pt.team_id
                            where pt.project_id = pm.project_id
                              and t2.organization_id is not distinct from t.organization_id
                          )
                          and not exists (
                            select 1 from project_team pt
                            where pt.project_id = pm.project_id and pt.team_id = ?
                          )
                        """,
                teamId, teamId, userId, teamId);
    }

    private void ensureProjectTeamLink(Long teamId, Long projectId) {
        if (teamId == null || projectId == null) {
            return;
        }
        jdbcTemplate.update(
                """
                        insert into project_team (project_id, team_id)
                        select ?, ?
                        where not exists (
                            select 1 from project_team where project_id = ? and team_id = ?
                        )
                        """,
                projectId, teamId, projectId, teamId);
    }

    private String teamProjectVisibilitySql(String projectTableAlias) {
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        if (teamId == null || uid == null) {
            return "1=0";
        }
        String alias = projectTableAlias == null || projectTableAlias.isBlank() ? "p" : projectTableAlias.trim();
        return """
                (
                    exists (
                        select 1 from project_team pt
                        where pt.project_id = %s.id and pt.team_id = %d
                    )
                    or (
                        exists (
                            select 1 from project_member pm
                            where pm.project_id = %s.id and pm.user_id = %d
                        )
                        and exists (
                            select 1 from team_membership tm
                            where tm.team_id = %d and tm.user_id = %d
                        )
                        and not exists (
                            select 1 from project_team pt
                            where pt.project_id = %s.id
                        )
                    )
                    or exists (
                        select 1 from app_user_role aur
                        where aur.project_id = %s.id
                          and aur.team_id = %d
                          and aur.user_id = %d
                          and aur.role_code = 'project_admin'
                    )
                )
                """
                .formatted(alias, teamId, alias, uid, teamId, uid, alias, alias, teamId, uid);
    }

    private List<Long> visibleProjectIds() {
        return collectVisibleProjectIds(true);
    }

    private List<Long> collectVisibleProjectIds(boolean addProjectFromUrl) {
        Long teamId = currentTeamId();
        Long uid = currentUserId();
        ensureProjectTeamLinksForUserInTeam(uid, teamId);

        String activeOnly = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
        LinkedHashSet<Long> idSet = new LinkedHashSet<>();

        jdbcTemplate.query(
                """
                        select distinct p.id
                        from project p
                        where """
                        + teamProjectVisibilitySql("p")
                        + activeOnly
                        + """
                                order by p.id
                                """,
                (rs, rowNum) -> idSet.add(rs.getLong("id")));

        if (addProjectFromUrl) {
            resolveProjectIdFromContextPath().ifPresent(projectId -> {
                idSet.add(projectId);
                ensureProjectTeamLink(teamId, projectId);
            });
        }

        return new ArrayList<>(idSet);
    }

    private String visibleProjectsInClause() {
        List<Long> ids = visibleProjectIds();
        return inClauseSql(ids == null || ids.isEmpty() ? List.of(-1L) : ids);
    }

    private Optional<Long> resolveProjectIdFromContextPath() {
        if (request == null) {
            return Optional.empty();
        }
        List<String> sources = new ArrayList<>();
        String uri = request.getRequestURI();
        if (uri != null && !uri.isBlank()) {
            sources.add(uri);
        }
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            sources.add(referer);
        }
        for (String src : sources) {
            Optional<String> code = TeamContextSupport.parseProjectCodeFromUrl(src);
            if (code.isEmpty()) {
                continue;
            }
            Optional<Long> fromPath = resolveProjectIdByCodeInTeam(code.get());
            if (fromPath.isPresent()) {
                return fromPath;
            }
        }
        return Optional.empty();
    }

    private Optional<Long> resolveProjectIdByCodeInTeam(String projectCode) {
        String key = TeamContextSupport.normalizePublicId(projectCode);
        if (key.isEmpty()) {
            return Optional.empty();
        }
        List<Long> ids = queryProjectIdsMatchingKeyInTeam(key);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    private List<Long> resolveProjectIdsForKanbanFilter(String projectParam) {
        if (projectParam == null || projectParam.isBlank()) {
            return visibleProjectIdsSafe();
        }
        String key = TeamContextSupport.normalizePublicId(projectParam);
        List<Long> visible = collectVisibleProjectIds(false);
        if (visible.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<Long> matched = new LinkedHashSet<>();
        for (Long id : queryProjectIdsMatchingKeyInTeam(key)) {
            if (visible.contains(id)) {
                matched.add(id);
            }
        }
        return new ArrayList<>(matched);
    }

    private List<Long> queryProjectIdsMatchingKeyInTeam(String key) {
        if (key == null || key.isEmpty()) {
            return List.of();
        }
        String activeOnly = hasColumn("project", "archived_at") ? " and p.archived_at is null " : "";
        boolean hasPublicId = hasColumn("project", "public_id");
        String matchSql = hasPublicId
                ? """
                        (lower(trim(cast(p.code as text))) = lower(?)
                         or lower(trim(cast(p.public_id as text))) = lower(?)
                         or lower(trim(cast(p.name as text))) = lower(?)
                         or cast(p.id as text) = ?)
                        """
                : """
                        (lower(trim(cast(p.code as text))) = lower(?)
                         or lower(trim(cast(p.name as text))) = lower(?)
                         or cast(p.id as text) = ?)
                        """;
        return jdbcTemplate.query(
                "select p.id from project p where " + teamProjectVisibilitySql("p") + activeOnly + " and " + matchSql
                        + " order by p.id desc",
                (rs, rowNum) -> rs.getLong("id"),
                hasPublicId ? new Object[] { key, key, key, key } : new Object[] { key, key, key });
    }

    private void ensureKanbanBoardsForProject(Long projectId) {
        if (projectId == null) {
            return;
        }
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
                    "select project_type from project where id = ?",
                    projectId);
            String type = String.valueOf(row.get("project_type"));
            if (!"kanban".equals(type) && !"scrum".equals(type)) {
                return;
            }
            Integer boardCount = jdbcTemplate.queryForObject(
                    "select count(*) from board where project_id = ?",
                    Integer.class,
                    projectId);
            if (boardCount != null && boardCount > 0) {
                return;
            }
            createDefaultProjectBoard(projectId, type);
        } catch (Exception ignored) {
        }
    }

    private String boardProjectArchiveFilter(boolean explicitProjectRequest) {
        boolean hasBoardArchived = hasColumn("board", "archived_at");
        boolean hasProjectArchived = hasColumn("project", "archived_at");
        if (!hasBoardArchived && !hasProjectArchived) {
            return "";
        }
        if (explicitProjectRequest) {
            return hasBoardArchived ? " and b.archived_at is null " : "";
        }
        if (hasBoardArchived && hasProjectArchived) {
            return " and b.archived_at is null and p.archived_at is null ";
        }
        if (hasBoardArchived) {
            return " and b.archived_at is null ";
        }
        return " and p.archived_at is null ";
    }

    private List<Long> visibleProjectIdsSafe() {
        try {
            List<Long> ids = visibleProjectIds();
            if (ids != null && !ids.isEmpty()) {
                return ids;
            }
        } catch (Exception ignored) {
        }
        return List.of();
    }

    private String inClauseSql(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return "-1";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0)
                sb.append(',');
            sb.append(ids.get(i));
        }
        return sb.toString();
    }

    private boolean hasColumn(String tableName, String columnName) {
        Integer c = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from information_schema.columns c
                        where c.table_name = ?
                          and c.column_name = ?
                          and c.table_schema = any (current_schemas(true))
                        """,
                Integer.class,
                tableName, columnName);
        return c != null && c > 0;
    }

    private boolean hasTable(String tableName) {
        Integer c = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from information_schema.tables t
                        where t.table_name = ?
                          and t.table_schema = any (current_schemas(true))
                        """,
                Integer.class,
                tableName);
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
            row.put("tasksSource",
                    "/api/kanban/tasks?boardId=" + boardId + (withProjectFilter ? "&project=" + project : ""));
            row.put("archivedTasks", List.of());
            outBoards.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("boards", outBoards);
        return out;
    }

    private Map<String, Object> kanbanTasksFallback(Long boardId, String project) {
        boolean withProjectFilter = project != null && !project.isBlank();
        List<Long> scopedProjectIds = withProjectFilter
                ? resolveProjectIdsForKanbanFilter(project)
                : visibleProjectIdsSafe();
        if (scopedProjectIds.isEmpty()) {
            return Map.of("tasks", List.of());
        }
        String projectsIn = inClauseSql(scopedProjectIds);
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
                    """ + sqlPersonDisplayName("u") + """
                as assignee_name,
                                   u.avatar_file as assignee_avatar
                               from task_item t
                               join board b on b.id = t.board_id
                               join project p on p.id = b.project_id
                               left join app_user u on u.id = t.assignee_id
                               where b.project_id in (""" + projectsIn + ") "
                + (boardId != null ? " and t.board_id = ? " : "")
                + " order by t.id";
        List<Map<String, Object>> rows = boardId != null
                ? jdbcTemplate.queryForList(sql, boardId)
                : jdbcTemplate.queryForList(sql);
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
        if (role == null)
            return "Участник";
        return switch (role) {
            case "owner" -> "Владелец";
            case "manager" -> "Менеджер";
            case "observer" -> "Наблюдатель";
            default -> "Разработка";
        };
    }

    private String toHumanTeamAccessRole(String role) {
        if (role == null)
            return "Участник";
        return switch (role) {
            case "team_admin" -> "Администратор команды";
            case "observer" -> "Наблюдатель";
            case "organization_registrar" -> "Регистратор организации";
            default -> "Участник";
        };
    }

    private String toHumanMembershipRole(String role) {
        if (role == null || role.isBlank()) {
            return "Участник";
        }
        return switch (role) {
            case "lead" -> "Руководитель";
            case "viewer" -> "Наблюдатель";
            default -> "Участник";
        };
    }

    private void putPersonNameFields(Map<String, Object> row, String lastName, String firstName, String patronymic) {
        String ln = lastName == null ? "" : lastName.trim();
        String fn = firstName == null ? "" : firstName.trim();
        String pat = patronymic == null ? "" : patronymic.trim();
        row.put("lastName", ln);
        row.put("firstName", fn);
        row.put("patronymic", pat);
        row.put("fullName", composePersonName(ln, fn, pat));
    }

    private String sqlPersonDisplayName(String tableAlias) {
        return """
                coalesce(
                    nullif(trim(concat_ws(' ', nullif(trim(%s.last_name), ''), nullif(trim(%s.first_name), ''))), ''),
                    %s.full_name,
                    ''
                )
                """.formatted(tableAlias, tableAlias, tableAlias);
    }

    private String composePersonName(String lastName, String firstName, String patronymic) {
        StringBuilder sb = new StringBuilder();
        appendNamePart(sb, lastName);
        appendNamePart(sb, firstName);
        appendNamePart(sb, patronymic);
        return sb.toString().trim();
    }

    private void appendNamePart(StringBuilder sb, String part) {
        if (part == null || part.isBlank())
            return;
        if (!sb.isEmpty())
            sb.append(' ');
        sb.append(part.trim());
    }

    private String birthDateFieldLabel(String visibility, boolean isSelf) {
        if (!isSelf && "month_day".equalsIgnoreCase(visibility)) {
            return "День рождения";
        }
        return "Дата рождения";
    }

    private void assertNotLastTeamAdmin(Long teamId, Long userId) {
        if (!isTeamAdmin(teamId, userId))
            return;
        Integer adminCount = countTeamAdmins(teamId);
        if (adminCount != null && adminCount <= 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "В команде должен остаться хотя бы один администратор. Назначьте другого администратора.");
        }
    }

    private Integer countTeamAdmins(Long teamId) {
        return jdbcTemplate.queryForObject(
                """
                        select count(distinct u.id)
                        from app_user u
                        join team_membership tm on tm.user_id = u.id and tm.team_id = ?
                        where tm.role = 'lead'
                           or exists (
                               select 1 from app_user_role aur
                               where aur.user_id = u.id and aur.team_id = ? and aur.role_code = 'team_admin'
                           )
                        """,
                Integer.class,
                teamId,
                teamId);
    }

    private boolean isTeamAdmin(Long teamId, Long userId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                """
                        select exists (
                            select 1 from team_membership tm
                            where tm.team_id = ? and tm.user_id = ? and tm.role = 'lead'
                        ) or exists (
                            select 1 from app_user_role aur
                            where aur.team_id = ? and aur.user_id = ? and aur.role_code = 'team_admin'
                        )
                        """,
                Boolean.class,
                teamId,
                userId,
                teamId,
                userId));
    }

    private void detachUserFromTeam(Long teamId, Long userId) {
        jdbcTemplate.update(
                "delete from app_user_role where user_id = ? and team_id = ?",
                userId,
                teamId);
        jdbcTemplate.update(
                "delete from team_membership where user_id = ? and team_id = ?",
                userId,
                teamId);
    }

    private void assignTeamAccessRole(Long teamId, String orgId, Long userId, String roleCode) {
        jdbcTemplate.update(
                """
                        delete from app_user_role
                        where user_id = ?
                          and team_id = ?
                          and role_code in ('team_admin', 'member', 'observer')
                        """,
                userId,
                teamId);
        jdbcTemplate.update(
                """
                        insert into app_user_role(user_id, role_code, organization_id, team_id)
                        values (?, ?, ?, ?)
                        on conflict (user_id, role_code, organization_id, team_id, project_id) do nothing
                        """,
                userId,
                roleCode,
                orgId,
                teamId);
        String membershipRole = switch (roleCode) {
            case "team_admin" -> "lead";
            case "observer" -> "viewer";
            default -> "member";
        };
        Integer membershipExists = jdbcTemplate.queryForObject(
                "select count(*) from team_membership where team_id = ? and user_id = ?",
                Integer.class,
                teamId,
                userId);
        if (membershipExists == null || membershipExists == 0) {
            jdbcTemplate.update(
                    "insert into team_membership(team_id, user_id, role) values (?, ?, ?)",
                    teamId,
                    userId,
                    membershipRole);
        } else {
            jdbcTemplate.update(
                    "update team_membership set role = ? where team_id = ? and user_id = ?",
                    membershipRole,
                    teamId,
                    userId);
        }
        try {
            jdbcTemplate.update(
                    "update app_user set team_joined_at = coalesce(team_joined_at, now()) where id = ?",
                    userId);
        } catch (DataAccessException ignored) {
        }
    }

    private String normalizeBirthDateVisibility(String raw) {
        if (raw == null)
            return "hidden";
        return switch (raw.trim().toLowerCase(Locale.ROOT)) {
            case "full" -> "full";
            case "month_day", "month-day", "monthday" -> "month_day";
            default -> "hidden";
        };
    }

    private String formatBirthDateForViewer(Object birthDateObj, String visibility, boolean isSelf) {
        if (birthDateObj == null)
            return null;
        if (!isSelf && "hidden".equalsIgnoreCase(visibility))
            return null;
        LocalDate date;
        if (birthDateObj instanceof Date sqlDate) {
            date = sqlDate.toLocalDate();
        } else if (birthDateObj instanceof LocalDate ld) {
            date = ld;
        } else {
            return null;
        }
        if (isSelf || "full".equalsIgnoreCase(visibility)) {
            return date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));
        }
        if ("month_day".equalsIgnoreCase(visibility)) {
            return date.format(DateTimeFormatter.ofPattern("dd.MM"));
        }
        return null;
    }

    private String toIsoDate(Object birthDateObj) {
        if (birthDateObj == null)
            return null;
        if (birthDateObj instanceof Date sqlDate) {
            return sqlDate.toLocalDate().toString();
        }
        if (birthDateObj instanceof LocalDate ld) {
            return ld.toString();
        }
        return null;
    }

    private String normalizeTeamAccessRole(String raw) {
        if (raw == null)
            return "member";
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "team_admin", "admin" -> "team_admin";
            case "observer", "viewer" -> "observer";
            default -> "member";
        };
    }

    private String resolveUserTeamAccessRole(Long userId, Long teamId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                            select coalesce(
                                (
                                    select aur.role_code
                                    from app_user_role aur
                                    where aur.user_id = ?
                                      and aur.team_id = ?
                                      and aur.role_code in ('team_admin', 'member', 'observer')
                                    order by aur.id desc
                                    limit 1
                                ),
                                (
                                    select case tm.role
                                        when 'lead' then 'team_admin'
                                        when 'viewer' then 'observer'
                                        else 'member'
                                    end
                                    from team_membership tm
                                    where tm.user_id = ? and tm.team_id = ?
                                ),
                                'member'
                            )
                            """,
                    String.class,
                    userId,
                    teamId,
                    userId,
                    teamId);
        } catch (Exception e) {
            return "member";
        }
    }

    private static String readTeamRenameValue(Map<String, Object> payload) {
        if (payload == null) {
            return "";
        }
        for (String key : List.of("teamName", "name")) {
            Object raw = payload.get(key);
            if (raw == null) {
                continue;
            }
            String value = String.valueOf(raw).trim();
            if (!value.isBlank() && !"null".equalsIgnoreCase(value)) {
                return value;
            }
        }
        return "";
    }

    private boolean currentUserCanManageTeam(Long teamId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            for (GrantedAuthority authority : authentication.getAuthorities()) {
                String role = authority.getAuthority();
                if ("ROLE_TEAM_ADMIN".equals(role) || "ROLE_ORGANIZATION_REGISTRAR".equals(role)) {
                    return true;
                }
            }
        }
        Long uid = currentUserId();
        Integer count = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from app_user_role aur
                        join app_team t on t.id = ?
                        where aur.user_id = ?
                          and (
                            (aur.team_id = t.id and aur.role_code = 'team_admin')
                            or (aur.organization_id = t.organization_id and aur.role_code = 'organization_registrar')
                          )
                        """,
                Integer.class,
                teamId,
                uid);
        if (count != null && count > 0) {
            return true;
        }
        Integer leadMembership = jdbcTemplate.queryForObject(
                "select count(*) from team_membership where user_id = ? and team_id = ? and role = 'lead'",
                Integer.class,
                uid,
                teamId);
        return leadMembership != null && leadMembership > 0;
    }

    private int stageOrder(String stage) {
        if (stage == null)
            return 99;
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

    private List<String> loadDefaultBoardStages(String projectType, String boardName) {
        return BoardStageDefaults.forBoard(projectType, boardName);
    }

    private Map<String, Object> activityRow(String key, String value) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("value", value);
        return row;
    }

    private int percent(int part, int total) {
        if (total <= 0)
            return 0;
        return Math.max(0, Math.min(100, (int) Math.round((part * 100.0) / total)));
    }

    private void saveTaskDependency(Long taskId, Long dependencyTaskId, String dependencyType) {
        if (taskId == null || dependencyTaskId == null || taskId.equals(dependencyTaskId))
            return;
        if (dependencyType == null || dependencyType.isBlank())
            return;
        switch (dependencyType) {
            case "blocks" -> jdbcTemplate.update(
                    """
                            insert into task_dependency(task_id, depends_on_task_id)
                            values (?, ?)
                            on conflict do nothing
                            """,
                    dependencyTaskId, taskId);
            case "blocked_by", "relates" -> jdbcTemplate.update(
                    """
                            insert into task_dependency(task_id, depends_on_task_id)
                            values (?, ?)
                            on conflict do nothing
                            """,
                    taskId, dependencyTaskId);
            default -> {
            }
        }
    }

    private String formatEstimateHours(java.math.BigDecimal value) {
        if (value == null)
            return null;
        return value.stripTrailingZeros().toPlainString();
    }

    private String toUiDate(Object sqlDateObj) {
        if (sqlDateObj == null)
            return null;
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
        if (tsObj == null)
            return null;
        if (tsObj instanceof Timestamp t)
            return t.toInstant().toString();
        if (tsObj instanceof java.time.OffsetDateTime odt)
            return odt.toInstant().toString();
        if (tsObj instanceof ZonedDateTime zdt)
            return zdt.toInstant().toString();
        if (tsObj instanceof LocalDateTime ldt) {
            return ldt.atZone(ZoneId.systemDefault()).toInstant().toString();
        }
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
