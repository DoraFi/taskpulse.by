package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CalendarEventService {

    private static final DateTimeFormatter UI_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final Pattern CONTEXT_TEAM_PATTERN = Pattern.compile("^/o/[^/]+/t/([^/]+)/api(?:/.*)?$");
    private static final Pattern BIRTHDAY_ID_PATTERN = Pattern.compile("^birthday-(.+)-(\\d{4})$");

    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;
    private final HttpServletRequest request;

    public CalendarEventService(JdbcTemplate jdbcTemplate,
            CurrentUserProvider currentUserProvider,
            HttpServletRequest request) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
        this.request = request;
    }

    public Map<String, Object> meta() {
        requireEventsTable();
        Context ctx = resolveContext();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canManage", ctx.canManage);
        out.put("organizationName", ctx.organizationName);
        out.put("teamName", ctx.teamName);
        out.put("teamPublicId", ctx.teamPublicId);
        return out;
    }

    public List<Map<String, Object>> list(String fromIso, String toIso) {
        requireEventsTable();
        Context ctx = resolveContext();
        LocalDate from = parseIsoDate(fromIso, LocalDate.now().withDayOfMonth(1));
        LocalDate to = parseIsoDate(toIso, from.plusMonths(1).minusDays(1));
        if (to.isBefore(from)) {
            LocalDate tmp = from;
            from = to;
            to = tmp;
        }
        List<Map<String, Object>> events = new ArrayList<>();
        events.addAll(loadCustomEvents(ctx, from, to));
        events.addAll(loadBirthdayEvents(ctx, from, to));
        events.sort(Comparator
                .comparing((Map<String, Object> e) -> String.valueOf(e.get("dateIso")))
                .thenComparing(e -> kindOrder(String.valueOf(e.get("kind"))))
                .thenComparing(e -> String.valueOf(e.get("title"))));
        return events;
    }

    public List<Map<String, Object>> upcoming(int limit) {
        requireEventsTable();
        Context ctx = resolveContext();
        LocalDate today = LocalDate.now();
        LocalDate to = today.plusDays(90);
        List<Map<String, Object>> events = new ArrayList<>();
        events.addAll(loadCustomEvents(ctx, today, to));
        events.addAll(loadBirthdayEvents(ctx, today, to));
        LocalDate finalToday = today;
        return events.stream()
                .filter(e -> daysUntil(String.valueOf(e.get("dateIso")), finalToday) >= 0)
                .sorted(Comparator.<Map<String, Object>>comparingInt(
                        e -> daysUntil(String.valueOf(e.get("dateIso")), finalToday))
                        .thenComparing(e -> kindOrder(String.valueOf(e.get("kind"))))
                        .thenComparing(e -> String.valueOf(e.get("title"))))
                .limit(Math.max(1, Math.min(limit, 30)))
                .toList();
    }

    public Map<String, Object> getByPublicId(String publicId) {
        requireEventsTable();
        Context ctx = resolveContext();
        if (publicId != null && publicId.startsWith("birthday-")) {
            return getBirthdayEvent(ctx, publicId);
        }
        UUID uuid = parseUuid(publicId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        select
                            e.public_id::text as public_id,
                            e.title,
                            coalesce(e.description, '') as description,
                            coalesce(e.location, '') as location,
                            coalesce(e.event_time, '') as event_time,
                            e.event_date,
                            e.event_end_date,
                            e.scope,
                            e.team_id,
                            t.name as team_name
                        from calendar_event e
                        left join app_team t on t.id = e.team_id
                        where e.public_id = ?
                          and e.organization_id = ?
                          and (
                            e.scope = 'organization'
                            or e.team_id = ?
                          )
                        limit 1
                        """,
                uuid,
                ctx.organizationId,
                ctx.teamId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        return mapCustomRow(rows.get(0), ctx);
    }

    public Map<String, Object> create(Map<String, Object> payload) {
        requireEventsTable();
        Context ctx = resolveContext();
        assertCanManage(ctx);
        String title = requiredText(payload.get("title"), "title");
        String description = optionalText(payload.get("description"));
        String location = optionalText(payload.get("location"));
        String eventTime = optionalText(payload.get("eventTime"));
        LocalDate eventDate = requiredIsoDate(payload.get("eventDate"), "eventDate");
        LocalDate eventEndDate = optionalIsoDate(payload.get("eventEndDate"));
        if (eventEndDate != null && eventEndDate.isBefore(eventDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Дата окончания не может быть раньше начала");
        }
        String scope = normalizeScope(String.valueOf(payload.getOrDefault("scope", "team")));
        Long teamId = "team".equals(scope) ? ctx.teamId : null;
        UUID publicId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                        insert into calendar_event(
                            public_id, organization_id, team_id, title, description,
                            location, event_time, event_date, event_end_date, scope, created_by
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                publicId,
                ctx.organizationId,
                teamId,
                title,
                description,
                location,
                eventTime,
                Date.valueOf(eventDate),
                eventEndDate != null ? Date.valueOf(eventEndDate) : null,
                scope,
                ctx.userId);
        return getByPublicId(publicId.toString());
    }

    public Map<String, Object> update(String publicId, Map<String, Object> payload) {
        requireEventsTable();
        Context ctx = resolveContext();
        assertCanManage(ctx);
        if (publicId != null && publicId.startsWith("birthday-")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "День рождения нельзя редактировать");
        }
        UUID uuid = parseUuid(publicId);
        Integer exists = jdbcTemplate.queryForObject(
                """
                        select count(*) from calendar_event
                        where public_id = ? and organization_id = ?
                          and (scope = 'organization' or team_id = ?)
                        """,
                Integer.class,
                uuid,
                ctx.organizationId,
                ctx.teamId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        String title = requiredText(payload.get("title"), "title");
        String description = optionalText(payload.get("description"));
        String location = optionalText(payload.get("location"));
        String eventTime = optionalText(payload.get("eventTime"));
        LocalDate eventDate = requiredIsoDate(payload.get("eventDate"), "eventDate");
        LocalDate eventEndDate = optionalIsoDate(payload.get("eventEndDate"));
        if (eventEndDate != null && eventEndDate.isBefore(eventDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Дата окончания не может быть раньше начала");
        }
        String scope = normalizeScope(String.valueOf(payload.getOrDefault("scope", "team")));
        Long teamId = "team".equals(scope) ? ctx.teamId : null;
        jdbcTemplate.update(
                """
                        update calendar_event
                        set title = ?, description = ?, location = ?, event_time = ?,
                            event_date = ?, event_end_date = ?, scope = ?, team_id = ?, updated_at = now()
                        where public_id = ?
                        """,
                title,
                description,
                location,
                eventTime,
                Date.valueOf(eventDate),
                eventEndDate != null ? Date.valueOf(eventEndDate) : null,
                scope,
                teamId,
                uuid);
        return getByPublicId(publicId);
    }

    public Map<String, Object> delete(String publicId) {
        requireEventsTable();
        Context ctx = resolveContext();
        assertCanManage(ctx);
        if (publicId != null && publicId.startsWith("birthday-")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "День рождения нельзя удалить");
        }
        UUID uuid = parseUuid(publicId);
        int deleted = jdbcTemplate.update(
                """
                        delete from calendar_event
                        where public_id = ? and organization_id = ?
                          and (scope = 'organization' or team_id = ?)
                        """,
                uuid,
                ctx.organizationId,
                ctx.teamId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        return Map.of("ok", true);
    }

    private List<Map<String, Object>> loadCustomEvents(Context ctx, LocalDate from, LocalDate to) {
        return jdbcTemplate.query(
                """
                        select
                            e.public_id::text as public_id,
                            e.title,
                            coalesce(e.description, '') as description,
                            coalesce(e.location, '') as location,
                            coalesce(e.event_time, '') as event_time,
                            e.event_date,
                            e.event_end_date,
                            e.scope,
                            e.team_id,
                            t.name as team_name
                        from calendar_event e
                        left join app_team t on t.id = e.team_id
                        where e.organization_id = ?
                          and e.event_date <= ?
                          and coalesce(e.event_end_date, e.event_date) >= ?
                          and (
                            e.scope = 'organization'
                            or e.team_id = ?
                          )
                        order by e.event_date, e.id
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("public_id", rs.getString("public_id"));
                    row.put("title", rs.getString("title"));
                    row.put("description", rs.getString("description"));
                    row.put("location", rs.getString("location"));
                    row.put("event_time", rs.getString("event_time"));
                    row.put("event_date", rs.getDate("event_date"));
                    row.put("event_end_date", rs.getDate("event_end_date"));
                    row.put("scope", rs.getString("scope"));
                    row.put("team_id", rs.getObject("team_id"));
                    row.put("team_name", rs.getString("team_name"));
                    return row;
                },
                ctx.organizationId,
                Date.valueOf(to),
                Date.valueOf(from),
                ctx.teamId).stream().map(r -> mapCustomRow(r, ctx)).toList();
    }

    private List<Map<String, Object>> loadBirthdayEvents(Context ctx, LocalDate from, LocalDate to) {
        List<Map<String, Object>> members = jdbcTemplate.query(
                """
                        select
                            u.id as user_id,
                            u.public_id,
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
                            coalesce(u.username, '') as username,
                            u.birth_date,
                            coalesce(u.birth_date_visibility, 'hidden') as birth_date_visibility,
                            coalesce(u.avatar_file, 'basic_avatar.png') as avatar
                        from app_user u
                        join team_membership tm on tm.user_id = u.id and tm.team_id = ?
                        where u.birth_date is not null
                        order by u.last_name, u.first_name
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("userId", rs.getLong("user_id"));
                    row.put("publicId", rs.getString("public_id"));
                    row.put("lastName", rs.getString("last_name"));
                    row.put("firstName", rs.getString("first_name"));
                    row.put("username", rs.getString("username"));
                    row.put("birthDate", rs.getDate("birth_date"));
                    row.put("birthDateVisibility", rs.getString("birth_date_visibility"));
                    row.put("avatar", rs.getString("avatar"));
                    return row;
                },
                ctx.teamId);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> member : members) {
            Long userId = ((Number) member.get("userId")).longValue();
            boolean isSelf = Objects.equals(userId, ctx.userId);
            String visibility = String.valueOf(member.get("birthDateVisibility"));
            if (!isSelf && "hidden".equalsIgnoreCase(visibility)) {
                continue;
            }
            Date birthSql = (Date) member.get("birthDate");
            if (birthSql == null) {
                continue;
            }
            LocalDate birth = birthSql.toLocalDate();
            for (int year = from.getYear(); year <= to.getYear(); year++) {
                LocalDate occurrence;
                try {
                    occurrence = birth.withYear(year);
                } catch (Exception ex) {
                    if (birth.getMonthValue() == 2 && birth.getDayOfMonth() == 29) {
                        occurrence = LocalDate.of(year, 2, 28);
                    } else {
                        continue;
                    }
                }
                if (occurrence.isBefore(from) || occurrence.isAfter(to)) {
                    continue;
                }
                out.add(mapBirthdayRow(member, occurrence, ctx, isSelf, visibility));
            }
        }
        return out;
    }

    private Map<String, Object> getBirthdayEvent(Context ctx, String publicId) {
        Matcher m = BIRTHDAY_ID_PATTERN.matcher(publicId);
        if (!m.matches()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        String userPublicId = m.group(1);
        int year = Integer.parseInt(m.group(2));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        select
                            u.id as user_id,
                            u.public_id,
                            coalesce(u.last_name, '') as last_name,
                            coalesce(u.first_name, '') as first_name,
                            coalesce(u.username, '') as username,
                            u.birth_date,
                            coalesce(u.birth_date_visibility, 'hidden') as birth_date_visibility,
                            coalesce(u.avatar_file, 'basic_avatar.png') as avatar
                        from app_user u
                        join team_membership tm on tm.user_id = u.id and tm.team_id = ?
                        where lower(trim(u.public_id)) = lower(trim(?))
                        limit 1
                        """,
                ctx.teamId,
                userPublicId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        Map<String, Object> member = rows.get(0);
        Long userId = ((Number) member.get("user_id")).longValue();
        boolean isSelf = Objects.equals(userId, ctx.userId);
        String visibility = String.valueOf(member.get("birth_date_visibility"));
        if (!isSelf && "hidden".equalsIgnoreCase(visibility)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        Date birthSql = (Date) member.get("birth_date");
        if (birthSql == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
        LocalDate birth = birthSql.toLocalDate();
        LocalDate occurrence;
        try {
            occurrence = birth.withYear(year);
        } catch (Exception ex) {
            occurrence = LocalDate.of(year, 2, 28);
        }
        Map<String, Object> normalized = normalizeBirthdayMember(member);
        Map<String, Object> mapped = mapBirthdayRow(normalized, occurrence, ctx, isSelf, visibility);
        mapped.put("memberPublicId", normalized.get("publicId"));
        return mapped;
    }

    private Map<String, Object> mapCustomRow(Map<String, Object> row, Context ctx) {
        Date start = (Date) row.get("event_date");
        Date end = (Date) row.get("event_end_date");
        LocalDate startDate = start.toLocalDate();
        LocalDate endDate = end != null ? end.toLocalDate() : startDate;
        String scope = String.valueOf(row.get("scope"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("public_id"));
        out.put("kind", "custom");
        out.put("kindLabel", "Событие");
        out.put("title", row.get("title"));
        out.put("subtitle", scopeLabel(scope, String.valueOf(row.get("team_name"))));
        out.put("description", row.get("description"));
        out.put("location", textOrEmpty(row.get("location")));
        out.put("eventTime", textOrEmpty(row.get("event_time")));
        out.put("date", UI_DATE.format(startDate));
        out.put("dateIso", startDate.toString());
        out.put("endDate", end != null ? UI_DATE.format(endDate) : null);
        out.put("endDateIso", end != null ? endDate.toString() : null);
        out.put("scope", scope);
        out.put("scopeLabel", scopeLabel(scope, String.valueOf(row.get("team_name"))));
        out.put("canEdit", ctx.canManage);
        out.put("canDelete", ctx.canManage);
        out.put("memberPublicId", null);
        out.put("avatar", null);
        return out;
    }

    private Map<String, Object> mapBirthdayRow(Map<String, Object> member,
            LocalDate occurrence,
            Context ctx,
            boolean isSelf,
            String visibility) {
        String publicId = textOrEmpty(member.get("publicId"));
        String personName = personDisplayName(member);
        String title = personName.isBlank() ? "День рождения" : ("День рождения - " + personName);
        Object birthRaw = member.get("birthDate");
        if (birthRaw == null) {
            birthRaw = member.get("birth_date");
        }
        Date birthSql = birthRaw instanceof Date d ? d : null;
        LocalDate birthDate = birthSql != null ? birthSql.toLocalDate() : null;
        boolean showBirthYear = isSelf || "full".equalsIgnoreCase(visibility);
        String dateDisplay = showBirthYear
                ? UI_DATE.format(occurrence)
                : occurrence.format(DateTimeFormatter.ofPattern("dd.MM"));
        Integer age = (showBirthYear && birthDate != null) ? occurrence.getYear() - birthDate.getYear() : null;
        String ageLabel = age != null ? formatAgeYears(age) : null;
        boolean birthdayPast = occurrence.isBefore(LocalDate.now());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", "birthday-" + publicId + "-" + occurrence.getYear());
        out.put("kind", "birthday");
        out.put("kindLabel", "День рождения");
        out.put("title", title);
        out.put("subtitle", ctx.teamName);
        out.put("description", "");
        out.put("date", dateDisplay);
        out.put("dateIso", occurrence.toString());
        out.put("endDate", null);
        out.put("endDateIso", null);
        out.put("scope", "team");
        out.put("scopeLabel", ctx.teamName);
        out.put("canEdit", false);
        out.put("canDelete", false);
        out.put("memberPublicId", publicId);
        out.put("avatar", member.get("avatar"));
        out.put("personName", personName);
        out.put("age", age);
        out.put("ageLabel", ageLabel);
        out.put("birthdayPast", birthdayPast);
        return out;
    }

    private static String formatAgeYears(int age) {
        if (age < 0) {
            return "";
        }
        int mod10 = age % 10;
        int mod100 = age % 100;
        String suffix;
        if (mod10 == 1 && mod100 != 11) {
            suffix = "год";
        } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            suffix = "года";
        } else {
            suffix = "лет";
        }
        return age + " " + suffix;
    }

    private void requireEventsTable() {
        if (!hasTable("calendar_event")) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Модуль событий ещё не развёрнут");
        }
    }

    private void assertCanManage(Context ctx) {
        if (!ctx.canManage) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав для управления событиями");
        }
    }

    private Context resolveContext() {
        Long teamId = contextTeamIdFromRequest();
        if (teamId == null) {
            teamId = jdbcTemplate.query(
                    "select team_id from team_membership where user_id = (select id from app_user where username = ? order by id limit 1) order by team_id limit 1",
                    (rs, rowNum) -> rs.getLong("team_id"),
                    currentUsername()).stream().findFirst().orElse(null);
        }
        if (teamId == null) {
            teamId = jdbcTemplate.queryForObject("select min(id) from app_team", Long.class);
        }
        Map<String, Object> teamRow = jdbcTemplate.queryForMap(
                """
                        select t.id, t.public_id::text as public_id, t.name, t.organization_id,
                               coalesce(org.name, t.organization_id::text) as organization_name
                        from app_team t
                        left join organization org on org.id = t.organization_id
                        where t.id = ?
                        """,
                teamId);
        Long userId = currentUserId();
        String orgId = String.valueOf(teamRow.get("organization_id"));
        boolean canManage = userCanManageTeam(teamId, userId, orgId);
        Context ctx = new Context();
        ctx.teamId = teamId;
        ctx.userId = userId;
        ctx.organizationId = orgId;
        ctx.teamPublicId = String.valueOf(teamRow.get("public_id"));
        ctx.teamName = String.valueOf(teamRow.get("name"));
        ctx.organizationName = String.valueOf(teamRow.get("organization_name"));
        ctx.canManage = canManage;
        return ctx;
    }

    private boolean userCanManageTeam(Long teamId, Long userId, String orgId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            for (GrantedAuthority authority : authentication.getAuthorities()) {
                String role = authority.getAuthority();
                if ("ROLE_TEAM_ADMIN".equals(role) || "ROLE_ORGANIZATION_REGISTRAR".equals(role)) {
                    return true;
                }
            }
        }
        Integer count = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from app_user_role aur
                        where aur.user_id = ?
                          and (
                            (aur.team_id = ? and aur.role_code = 'team_admin')
                            or (aur.organization_id = ? and aur.role_code = 'organization_registrar')
                          )
                        """,
                Integer.class,
                userId,
                teamId,
                orgId);
        if (count != null && count > 0) {
            return true;
        }
        Integer lead = jdbcTemplate.queryForObject(
                "select count(*) from team_membership where user_id = ? and team_id = ? and role = 'lead'",
                Integer.class,
                userId,
                teamId);
        return lead != null && lead > 0;
    }

    private Long contextTeamIdFromRequest() {
        try {
            String uri = request != null ? request.getRequestURI() : null;
            if (uri == null || uri.isBlank()) {
                return null;
            }
            Matcher m = CONTEXT_TEAM_PATTERN.matcher(uri);
            if (!m.matches()) {
                return null;
            }
            String teamPublicId = m.group(1);
            List<Long> ids = jdbcTemplate.query(
                    "select id from app_team where lower(trim(public_id)) = lower(trim(?)) order by id desc limit 1",
                    (rs, rowNum) -> rs.getLong("id"),
                    teamPublicId);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Long currentUserId() {
        String username = currentUsername();
        if (username == null) {
            return jdbcTemplate.queryForObject("select min(id) from app_user", Long.class);
        }
        List<Long> ids = jdbcTemplate.query(
                "select id from app_user where username = ? order by id limit 1",
                (rs, rowNum) -> rs.getLong("id"),
                username);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        return jdbcTemplate.queryForObject("select min(id) from app_user", Long.class);
    }

    private String currentUsername() {
        return currentUserProvider.getUsername();
    }

    private boolean hasTable(String table) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.tables where table_schema = 'public' and table_name = ?",
                    Integer.class,
                    table);
            return count != null && count > 0;
        } catch (DataAccessException ex) {
            return false;
        }
    }

    private static String scopeLabel(String scope, String teamName) {
        if ("organization".equals(scope)) {
            return "Вся организация";
        }
        return teamName != null && !teamName.isBlank() ? teamName : "Команда";
    }

    private static int kindOrder(String kind) {
        return "birthday".equals(kind) ? 0 : 1;
    }

    private static int daysUntil(String dateIso, LocalDate today) {
        LocalDate date = LocalDate.parse(dateIso);
        return (int) ChronoUnit.DAYS.between(today, date);
    }

    private static LocalDate parseIsoDate(String raw, LocalDate fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        return LocalDate.parse(raw.trim());
    }

    private static LocalDate requiredIsoDate(Object raw, String field) {
        if (raw == null || String.valueOf(raw).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " обязателен");
        }
        return LocalDate.parse(String.valueOf(raw).trim());
    }

    private static LocalDate optionalIsoDate(Object raw) {
        if (raw == null) {
            return null;
        }
        String text = String.valueOf(raw).trim();
        if (text.isBlank() || "null".equalsIgnoreCase(text)) {
            return null;
        }
        return LocalDate.parse(text);
    }

    private static String requiredText(Object raw, String field) {
        String text = raw == null ? "" : String.valueOf(raw).trim();
        if (text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " обязателен");
        }
        return text;
    }

    private static String optionalText(Object raw) {
        if (raw == null) {
            return "";
        }
        String text = String.valueOf(raw).trim();
        return "null".equalsIgnoreCase(text) ? "" : text;
    }

    private static String normalizeScope(String raw) {
        if ("organization".equalsIgnoreCase(raw) || "org".equalsIgnoreCase(raw)) {
            return "organization";
        }
        return "team";
    }

    private static UUID parseUuid(String publicId) {
        try {
            return UUID.fromString(String.valueOf(publicId).trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Событие не найдено");
        }
    }

    private static Map<String, Object> normalizeBirthdayMember(Map<String, Object> member) {
        Map<String, Object> out = new LinkedHashMap<>();
        Object userId = member.get("userId");
        if (userId == null) {
            userId = member.get("user_id");
        }
        out.put("userId", userId);
        out.put("publicId", firstNonBlank(member.get("publicId"), member.get("public_id")));
        out.put("lastName", firstNonBlank(member.get("lastName"), member.get("last_name")));
        out.put("firstName", firstNonBlank(member.get("firstName"), member.get("first_name")));
        out.put("username", firstNonBlank(member.get("username")));
        out.put("birthDate", member.get("birthDate") != null ? member.get("birthDate") : member.get("birth_date"));
        out.put("birthDateVisibility",
                firstNonBlank(member.get("birthDateVisibility"), member.get("birth_date_visibility")));
        out.put("avatar", firstNonBlank(member.get("avatar"), "basic_avatar.png"));
        return out;
    }

    private static String personDisplayName(Map<String, Object> member) {
        String name = composeName(
                textOrEmpty(member.get("lastName")),
                textOrEmpty(member.get("firstName")));
        if (!name.isBlank()) {
            return name;
        }
        String username = textOrEmpty(member.get("username"));
        return username.isBlank() ? "Участник команды" : username;
    }

    private static String composeName(String lastName, String firstName) {
        StringBuilder sb = new StringBuilder();
        if (lastName != null && !lastName.isBlank() && !"null".equalsIgnoreCase(lastName)) {
            sb.append(lastName.trim());
        }
        if (firstName != null && !firstName.isBlank() && !"null".equalsIgnoreCase(firstName)) {
            if (!sb.isEmpty()) {
                sb.append(' ');
            }
            sb.append(firstName.trim());
        }
        return sb.toString().trim();
    }

    private static String textOrEmpty(Object value) {
        if (value == null) {
            return "";
        }
        String s = String.valueOf(value).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static String firstNonBlank(Object... values) {
        if (values == null) {
            return "";
        }
        for (Object value : values) {
            String s = textOrEmpty(value);
            if (!s.isBlank()) {
                return s;
            }
        }
        return "";
    }

    private static final class Context {
        Long teamId;
        Long userId;
        String organizationId;
        String teamPublicId;
        String teamName;
        String organizationName;
        boolean canManage;
    }
}
