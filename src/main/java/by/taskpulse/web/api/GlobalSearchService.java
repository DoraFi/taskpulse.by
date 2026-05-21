package by.taskpulse.web.api;

import by.taskpulse.auth.CurrentUserProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class GlobalSearchService {

    private static final int MIN_QUERY_LEN = 2;
    private static final Pattern CONTEXT_TEAM_URI = Pattern.compile("^/o/[^/]+/t/([^/]+)/api(?:/.*)?$");

    private record StaticEntry(String[] keywords, String kind, String title, String subtitle,
                               String pathSuffix, String settingsPanel, String action) {}

    private static final List<StaticEntry> STATIC_ENTRIES = List.of(
            new StaticEntry(new String[]{"главная", "сводка", "home", "index", "дашборд"}, "nav", "Главная", "Раздел приложения", "", null, "navigate"),
            new StaticEntry(new String[]{"задачи", "tasks", "мои задачи"}, "nav", "Задачи", "Раздел приложения", "/tasks", null, "navigate"),
            new StaticEntry(new String[]{"проекты", "projects", "проект"}, "nav", "Проекты", "Раздел приложения", "/projects", null, "navigate"),
            new StaticEntry(new String[]{"проекты организации", "org projects"}, "nav", "Проекты организации", "Раздел приложения", "/projects/org", null, "navigate"),
            new StaticEntry(new String[]{"архив проектов", "архивные"}, "nav", "Архивные проекты", "Раздел приложения", "/projects/archive", null, "navigate"),
            new StaticEntry(new String[]{"команда", "team", "участники"}, "nav", "Команда", "Раздел приложения", "/team", null, "navigate"),
            new StaticEntry(new String[]{"аналитика", "analytics", "отчёты", "отчеты", "диаграммы"}, "nav", "Аналитика", "Раздел приложения", "/analytics", null, "navigate"),
            new StaticEntry(new String[]{"сравнение проектов", "compare"}, "nav", "Сравнение проектов", "Аналитика", "/analytics#compare", null, "navigate"),
            new StaticEntry(new String[]{"помощь", "справка", "help", "faq"}, "nav", "Помощь", "Раздел приложения", "/help#faq", null, "navigate"),
            new StaticEntry(new String[]{"поддержка", "support", "заявка"}, "nav", "Поддержка", "Помощь", "/help#support", null, "navigate"),
            new StaticEntry(new String[]{"документация", "docs", "руководство"}, "nav", "Документация", "Помощь", "/help#docs/page/index", null, "navigate"),

            new StaticEntry(new String[]{"создать задачу", "новая задача", "create task", "добавить задачу"}, "command", "Создать задачу", "Команда", null, null, "createTask"),
            new StaticEntry(new String[]{"профиль", "profile", "мой аккаунт"}, "command", "Открыть профиль", "Команда", null, null, "openProfile"),
            new StaticEntry(new String[]{"настройки", "settings", "параметры"}, "command", "Открыть настройки", "Команда", null, null, "openSettings"),
            new StaticEntry(new String[]{"выйти", "logout", "выход"}, "command", "Выйти из аккаунта", "Команда", "/auth/welcome", null, "navigate"),

            new StaticEntry(new String[]{"язык", "locale", "формат даты", "общие"}, "settings", "Общие настройки", "Настройки", null, "general", "openSettingsPanel"),
            new StaticEntry(new String[]{"внешний вид", "тема", "theme", "тёмная", "светлая"}, "settings", "Внешний вид", "Настройки", null, "appearance", "openSettingsPanel"),
            new StaticEntry(new String[]{"безопасность", "пароль", "2fa", "security"}, "settings", "Безопасность", "Настройки", null, "security", "openSettingsPanel"),
            new StaticEntry(new String[]{"доступ", "роли", "приглашения", "команда и доступ"}, "settings", "Команда и доступ", "Настройки", null, "team", "openSettingsPanel"),
            new StaticEntry(new String[]{"данные", "удаление аккаунта", "аккаунт"}, "settings", "Данные", "Настройки", null, "data", "openSettingsPanel")
    );

    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;
    private final HelpCenterService helpCenter;

    public GlobalSearchService(JdbcTemplate jdbcTemplate,
                               CurrentUserProvider currentUserProvider,
                               HelpCenterService helpCenter) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
        this.helpCenter = helpCenter;
    }

    public Map<String, Object> search(String query) {
        String q = query == null ? "" : query.trim();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", q);
        if (q.length() < MIN_QUERY_LEN) {
            out.put("items", List.of());
            return out;
        }

        Long teamId = resolveTeamId();
        String basePath = resolveBasePath(teamId);
        String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
        List<Map<String, Object>> items = new ArrayList<>();

        safeAddAll(items, () -> matchStatic(q, basePath));
        safeAddAll(items, () -> searchTasks(teamId, pattern, basePath));
        safeAddAll(items, () -> searchProjects(teamId, pattern, basePath, false));
        safeAddAll(items, () -> searchProjects(teamId, pattern, basePath, true));
        safeAddAll(items, () -> searchBoards(teamId, pattern, basePath));
        safeAddAll(items, () -> searchMembers(teamId, pattern, basePath));
        safeAddAll(items, () -> searchLabels(teamId, pattern, basePath));
        safeAddAll(items, () -> searchComments(teamId, pattern, basePath));
        if (hasTable("team_mail_message")) {
            safeAddAll(items, () -> searchTeamMail(teamId, pattern, basePath));
        }
        try {
            items.addAll(mapFaq(helpCenter.searchFaq(q), basePath));
        } catch (Exception ignored) {
        }
        try {
            items.addAll(mapDocs(helpCenter.searchDocs(q), basePath));
        } catch (Exception ignored) {
        }

        out.put("items", items);
        out.put("basePath", basePath);
        return out;
    }

    private void safeAddAll(List<Map<String, Object>> target, java.util.function.Supplier<List<Map<String, Object>>> supplier) {
        try {
            target.addAll(supplier.get());
        } catch (Exception ignored) {
        }
    }

    private List<Map<String, Object>> matchStatic(String q, String basePath) {
        String lower = q.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> items = new ArrayList<>();
        for (StaticEntry e : STATIC_ENTRIES) {
            if (!matchesKeywords(lower, e.keywords())) continue;
            Map<String, Object> item = baseItem(e.kind(), e.title(), e.subtitle(), null);
            if (e.pathSuffix() != null && !e.pathSuffix().isBlank()) {
                if (e.pathSuffix().startsWith("/auth")) {
                    item.put("href", e.pathSuffix());
                } else {
                    item.put("href", basePath + e.pathSuffix());
                }
                item.put("action", "navigate");
            } else if ("openSettingsPanel".equals(e.action()) && e.settingsPanel() != null) {
                item.put("action", "openSettingsPanel");
                item.put("settingsPanel", e.settingsPanel());
            } else {
                item.put("action", e.action());
            }
            items.add(item);
        }
        return items;
    }

    private boolean matchesKeywords(String lowerQuery, String[] keywords) {
        for (String kw : keywords) {
            if (kw == null || kw.isBlank()) continue;
            if (lowerQuery.contains(kw.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private List<Map<String, Object>> searchTasks(Long teamId, String pattern, String basePath) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select
                    t.id,
                    coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as display_id,
                    t.name,
                    t.task_code,
                    t.stage,
                    t.priority,
                    left(coalesce(t.description, ''), 220) as snippet,
                    p.code as project_code,
                    p.name as project_name,
                    coalesce(p.project_type, 'kanban') as project_type
                from task_item t
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and (
                    lower(t.name) like ?
                    or lower(coalesce(t.task_code, '')) like ?
                    or lower(coalesce(t.public_id, '')) like ?
                    or lower(coalesce(t.description, '')) like ?
                  )
                order by t.id desc
                limit 20
                """,
                teamId, pattern, pattern, pattern, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String projectName = String.valueOf(row.get("project_name"));
            String projectCode = String.valueOf(row.get("project_code"));
            String displayId = String.valueOf(row.get("display_id"));
            Map<String, Object> item = baseItem("task", displayId + " · " + row.get("name"), projectName + " [" + projectCode + "]", row.get("snippet"));
            item.put("action", "openTask");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", ((Number) row.get("id")).longValue());
            payload.put("taskDbId", ((Number) row.get("id")).longValue());
            payload.put("name", row.get("name"));
            payload.put("displayId", displayId);
            payload.put("publicId", displayId);
            payload.put("taskCode", row.get("task_code"));
            payload.put("stage", row.get("stage"));
            payload.put("priority", row.get("priority"));
            payload.put("project", projectName + " [" + projectCode + "]");
            payload.put("projectType", mapProjectTypeForUi(String.valueOf(row.get("project_type"))));
            item.put("payload", payload);
            item.put("href", projectBoardHref(basePath, projectCode, String.valueOf(row.get("project_type"))));
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchProjects(Long teamId, String pattern, String basePath, boolean archivedOnly) {
        String archivedClause = hasColumn("project", "archived_at")
                ? (archivedOnly ? " and p.archived_at is not null " : " and p.archived_at is null ")
                : "";
        boolean hasProjectPublicId = hasColumn("project", "public_id");
        String publicIdClause = hasProjectPublicId ? " or lower(coalesce(p.public_id, '')) like ?" : "";
        Object[] args = hasProjectPublicId
                ? new Object[] { teamId, pattern, pattern, pattern }
                : new Object[] { teamId, pattern, pattern };
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select p.code, p.name, coalesce(p.project_type, 'kanban') as project_type
                from project p
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                """
                        + archivedClause
                        + """
                  and (lower(p.name) like ? or lower(coalesce(p.code, '')) like ?
                """
                        + publicIdClause
                        + """
                )
                order by p.name
                limit 12
                """,
                args
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String code = String.valueOf(row.get("code"));
            String subtitle = archivedOnly ? "Архивный проект" : "Проект";
            Map<String, Object> item = baseItem("project", String.valueOf(row.get("name")), subtitle + " · " + code, null);
            item.put("href", projectBoardHref(basePath, code, String.valueOf(row.get("project_type"))));
            item.put("action", "navigate");
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchBoards(Long teamId, String pattern, String basePath) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select b.name as board_name, b.code as board_code, p.code as project_code, p.name as project_name,
                       coalesce(p.project_type, 'kanban') as project_type
                from board b
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and (lower(b.name) like ? or lower(coalesce(b.code, '')) like ?
                       or lower(coalesce(p.name, '')) like ?)
                order by p.name, b.name
                limit 12
                """,
                teamId, pattern, pattern, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String code = String.valueOf(row.get("project_code"));
            Map<String, Object> item = baseItem(
                    "board",
                    String.valueOf(row.get("board_name")),
                    String.valueOf(row.get("project_name")) + " · " + code,
                    null
            );
            item.put("href", projectBoardHref(basePath, code, String.valueOf(row.get("project_type"))));
            item.put("action", "navigate");
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchMembers(Long teamId, String pattern, String basePath) {
        String displayName = sqlPersonDisplayName("u");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select u.public_id, """
                        + displayName
                        + """
                 as display_name, u.email, u.username, tm.role
                from team_membership tm
                join app_user u on u.id = tm.user_id
                where tm.team_id = ?
                  and (
                    lower(u.email) like ?
                    or lower(u.username) like ?
                    or lower(coalesce(u.full_name, '')) like ?
                    or lower("""
                        + displayName
                        + """
                    ) like ?
                  )
                order by display_name
                limit 12
                """,
                teamId, pattern, pattern, pattern, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = baseItem(
                    "member",
                    String.valueOf(row.get("display_name")),
                    String.valueOf(row.get("email")) + " · " + row.get("role"),
                    null
            );
            item.put("href", basePath + "/team");
            item.put("action", "navigate");
            item.put("payload", Map.of("publicId", row.get("public_id")));
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchLabels(Long teamId, String pattern, String basePath) {
        if (!hasTable("task_label")) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select l.name, l.color
                from task_label l
                join organization org on org.id = l.organization_id
                join app_team t on t.organization_id = org.id
                where t.id = ?
                  and lower(l.name) like ?
                order by l.name
                limit 8
                """,
                teamId, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = baseItem("label", String.valueOf(row.get("name")), "Метка задачи", null);
            item.put("href", basePath + "/tasks");
            item.put("action", "navigate");
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchComments(Long teamId, String pattern, String basePath) {
        if (!hasTable("task_comment")) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select t.id as task_id,
                       coalesce(t.public_id, t.task_code, 'TSK-' || t.id::text) as display_id,
                       t.name as task_name,
                       left(c.body, 200) as snippet,
                       p.code as project_code,
                       coalesce(p.project_type, 'kanban') as project_type
                from task_comment c
                join task_item t on t.id = c.task_id
                join board b on b.id = t.board_id
                join project p on p.id = b.project_id
                join project_team pt on pt.project_id = p.id
                where pt.team_id = ?
                  and lower(c.body) like ?
                order by c.id desc
                limit 8
                """,
                teamId, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = baseItem(
                    "comment",
                    "Комментарий · " + row.get("display_id"),
                    String.valueOf(row.get("task_name")),
                    row.get("snippet")
            );
            item.put("action", "openTask");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", ((Number) row.get("task_id")).longValue());
            payload.put("taskDbId", ((Number) row.get("task_id")).longValue());
            payload.put("name", row.get("task_name"));
            payload.put("displayId", row.get("display_id"));
            item.put("payload", payload);
            item.put("href", projectBoardHref(basePath, String.valueOf(row.get("project_code")), String.valueOf(row.get("project_type"))));
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> searchTeamMail(Long teamId, String pattern, String basePath) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select id, subject, left(body, 180) as snippet
                from team_mail_message
                where team_id = ?
                  and (lower(subject) like ? or lower(body) like ?)
                order by created_at desc
                limit 8
                """,
                teamId, pattern, pattern
        );
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = baseItem("mail", String.valueOf(row.get("subject")), "Почта команды", row.get("snippet"));
            item.put("href", basePath + "/team");
            item.put("action", "navigate");
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> mapFaq(List<Map<String, Object>> faqRows, String basePath) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : faqRows) {
            String preview = preview(String.valueOf(row.get("answer")), 180);
            Map<String, Object> item = baseItem("faq", String.valueOf(row.get("question")), "Частые вопросы", preview);
            item.put("href", basePath + "/help#faq");
            item.put("action", "navigate");
            item.put("payload", Map.of("faqId", row.get("id")));
            items.add(item);
        }
        return items;
    }

    private List<Map<String, Object>> mapDocs(List<Map<String, Object>> docRows, String basePath) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : docRows) {
            String kind = String.valueOf(row.get("kind"));
            String section = String.valueOf(row.get("section_slug"));
            String article = String.valueOf(row.get("article_slug"));
            Map<String, Object> item = baseItem(
                    "doc",
                    String.valueOf(row.get("title")),
                    String.valueOf(row.get("section_title")),
                    preview(String.valueOf(row.get("snippet")), 220)
            );
            item.put("href", basePath + "/help#docs/" + kind + "/" + section + "/" + article);
            item.put("action", "navigate");
            items.add(item);
        }
        return items;
    }

    private Map<String, Object> baseItem(String kind, String title, String subtitle, Object snippet) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("kind", kind);
        item.put("title", title);
        item.put("subtitle", subtitle);
        if (snippet != null && !String.valueOf(snippet).isBlank()) {
            item.put("snippet", snippet);
        }
        return item;
    }

    private String projectBoardHref(String basePath, String projectCode, String projectType) {
        String code = projectCode == null ? "" : projectCode.trim();
        if (code.isEmpty()) return basePath + "/projects";
        String enc = java.net.URLEncoder.encode(code, java.nio.charset.StandardCharsets.UTF_8);
        String type = projectType == null ? "" : projectType.toLowerCase(Locale.ROOT);
        if ("kanban".equals(type)) {
            return basePath + "/p/" + enc + "/kanban?project=" + enc;
        }
        if ("scrum".equals(type)) {
            return basePath + "/p/" + enc + "/scrum?project=" + enc;
        }
        return basePath + "/p/" + enc + "/boards?project=" + enc;
    }

    private String mapProjectTypeForUi(String projectType) {
        if (projectType == null) return "kanban";
        String t = projectType.toLowerCase(Locale.ROOT);
        if ("list".equals(t) || "simple".equals(t)) return "list";
        return "kanban";
    }

    private String preview(String text, int max) {
        if (text == null) return "";
        String s = stripMarkdown(text);
        if (s.length() <= max) return s;
        return s.substring(0, max).trim() + "…";
    }

    private String stripMarkdown(String text) {
        if (text == null) return "";
        String s = text;
        s = s.replaceAll("(?s)```.*?```", " ");
        s = s.replaceAll("!\\[[^\\]]*]\\([^)]*\\)", "");
        s = s.replaceAll("\\[([^\\]]+)]\\([^)]*\\)", "$1");
        s = s.replaceAll("#{1,6}\\s*", " ");
        s = s.replaceAll("\\*\\*([^*]+)\\*\\*", "$1");
        s = s.replaceAll("__([^_]+)__", "$1");
        s = s.replaceAll("(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)", "$1");
        s = s.replaceAll("(?<!_)_([^_\\n]+)_(?!_)", "$1");
        s = s.replaceAll("`([^`\\n]+)`", "$1");
        s = s.replaceAll("~~([^~]+)~~", "$1");
        s = s.replaceAll("(?m)^\\s*[-*+]\\s+", "");
        s = s.replaceAll("(?m)^\\s*\\d+\\.\\s+", "");
        s = s.replaceAll("(?m)^\\s*>\\s?", "");
        return s.replaceAll("\\s+", " ").trim();
    }

    private String resolveBasePath(Long teamId) {
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
                    """
                    select coalesce(org.public_id, '') as org_public_id,
                           coalesce(t.public_id, '') as team_public_id
                    from app_team t
                    join organization org on org.id = t.organization_id
                    where t.id = ?
                    """,
                    teamId
            );
            String org = String.valueOf(row.get("org_public_id")).trim();
            String team = String.valueOf(row.get("team_public_id")).trim();
            if (!org.isBlank() && !team.isBlank()) {
                return "/o/" + org + "/t/" + team;
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private Long resolveTeamId() {
        Long fromUri = contextTeamIdFromRequest();
        if (fromUri != null) return fromUri;
        Long uid = currentUserId();
        List<Long> ids = jdbcTemplate.query(
                "select team_id from team_membership where user_id = ? order by team_id limit 1",
                (rs, rowNum) -> rs.getLong("team_id"),
                uid
        );
        if (!ids.isEmpty()) return ids.get(0);
        List<Long> fallback = jdbcTemplate.query(
                "select id from app_team order by id limit 1",
                (rs, rowNum) -> rs.getLong("id")
        );
        if (fallback.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Нет доступной команды");
        }
        return fallback.get(0);
    }

    private Long contextTeamIdFromRequest() {
        try {
            HttpServletRequest request = currentRequest();
            if (request == null) return null;
            String uri = request.getRequestURI();
            if (uri == null || uri.isBlank()) return null;
            Matcher m = CONTEXT_TEAM_URI.matcher(uri);
            if (!m.matches()) return null;
            String teamPublicId = m.group(1);
            List<Long> ids = jdbcTemplate.query(
                    "select id from app_team where public_id = ? limit 1",
                    (rs, rowNum) -> rs.getLong("id"),
                    teamPublicId
            );
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest();
        }
        return null;
    }

    private Long currentUserId() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Требуется авторизация");
        }
        List<Long> ids = jdbcTemplate.query(
                "select id from app_user where username = ? and coalesce(is_active, true) = true limit 1",
                (rs, rowNum) -> rs.getLong("id"),
                username
        );
        if (ids.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Пользователь не найден");
        }
        return ids.get(0);
    }

    private boolean hasColumn(String table, String column) {
        List<Boolean> rows = jdbcTemplate.query(
                """
                select exists (
                    select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = ? and column_name = ?
                )
                """,
                (rs, rowNum) -> rs.getBoolean(1),
                table, column
        );
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.get(0));
    }

    private boolean hasTable(String table) {
        List<Boolean> rows = jdbcTemplate.query(
                "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = ?)",
                (rs, rowNum) -> rs.getBoolean(1),
                table
        );
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.get(0));
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
}
