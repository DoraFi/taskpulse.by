package by.taskpulse.web.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import by.taskpulse.auth.CurrentUserProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class HelpCenterService {

    private static final Path SUPPORT_UPLOADS_ROOT = Path.of("static", "uploads", "help");
    private static final int MAX_FILES = 5;
    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024;

    private final JdbcTemplate jdbcTemplate;
    private final CurrentUserProvider currentUserProvider;

    public HelpCenterService(JdbcTemplate jdbcTemplate, CurrentUserProvider currentUserProvider) {
        this.jdbcTemplate = jdbcTemplate;
        this.currentUserProvider = currentUserProvider;
    }

    public Map<String, Object> supportInfo() {
        requireHelpTables();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", "Заявка в поддержку");
        out.put("leadText", "Опишите проблему и приложите скриншоты или файлы. Ответ придёт на email аккаунта.");
        out.put("workHours", "Пн–Пт, 09:00–18:00 (Минск)");
        out.put("responseHint", "Отвечаем в течение рабочего дня");
        out.put("maxFiles", MAX_FILES);
        out.put("maxFileSizeMb", 10);
        out.put("allowedExtensions", List.of("png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "doc", "docx", "zip"));
        return out;
    }

    public List<Map<String, Object>> listFaqByCategory() {
        requireHelpTables();
        if (!hasTable("help_faq_category")) {
            return listFaqFlatGrouped();
        }
        List<Map<String, Object>> categories = jdbcTemplate.queryForList(
                """
                select id, slug, title, position_no
                from help_faq_category
                where is_published = true
                order by position_no, id
                """
        );
        List<Map<String, Object>> questions = jdbcTemplate.queryForList(
                """
                select id, category_id, position_no, question, answer
                from help_faq
                where is_published = true
                order by position_no, id
                """
        );
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> cat : categories) {
            long catId = ((Number) cat.get("id")).longValue();
            List<Map<String, Object>> items = new ArrayList<>();
            for (Map<String, Object> q : questions) {
                Object rawCatId = q.get("category_id");
                if (rawCatId == null) continue;
                if (((Number) rawCatId).longValue() != catId) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", q.get("id"));
                item.put("question", q.get("question"));
                item.put("answer", q.get("answer"));
                items.add(item);
            }
            Map<String, Object> block = new LinkedHashMap<>();
            block.put("slug", cat.get("slug"));
            block.put("title", cat.get("title"));
            block.put("questions", items);
            result.add(block);
        }
        return result;
    }

    public List<Map<String, Object>> searchFaq(String query) {
        requireHelpTables();
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) {
            return List.of();
        }
        String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
        if (hasTable("help_faq_category")) {
            return jdbcTemplate.queryForList(
                    """
                    select f.id, f.question, f.answer, c.slug as category_slug, c.title as category_title
                    from help_faq f
                    left join help_faq_category c on c.id = f.category_id
                    where f.is_published = true
                      and (lower(f.question) like ? or lower(f.answer) like ?)
                    order by c.position_no nulls last, f.position_no, f.id
                    limit 40
                    """,
                    pattern, pattern
            );
        }
        return jdbcTemplate.queryForList(
                """
                select id, question, answer
                from help_faq
                where is_published = true
                  and (lower(question) like ? or lower(answer) like ?)
                order by position_no, id
                limit 40
                """,
                pattern, pattern
        );
    }

    public Map<String, Object> submitSupportTicket(String subject, String message, List<MultipartFile> files) {
        requireHelpTables();
        requireTicketTables();
        String subj = subject == null ? "" : subject.trim();
        String body = message == null ? "" : message.trim();
        if (subj.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите тему заявки (минимум 3 символа)");
        }
        if (body.length() < 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Опишите проблему подробнее (минимум 10 символов)");
        }
        if (subj.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Тема слишком длинная");
        }

        Long userId = currentUserId();
        Long teamId = currentTeamIdOrNull();

        Long ticketId = jdbcTemplate.queryForObject(
                """
                insert into help_support_ticket (user_id, team_id, subject, message, status)
                values (?, ?, ?, ?, 'new')
                returning id
                """,
                Long.class,
                userId, teamId, subj, body
        );

        int savedFiles = 0;
        if (files != null) {
            if (files.size() > MAX_FILES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не более " + MAX_FILES + " файлов");
            }
            for (MultipartFile file : files) {
                if (file == null || file.isEmpty()) continue;
                saveTicketAttachment(ticketId, file);
                savedFiles++;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("ticketId", ticketId);
        out.put("attachmentCount", savedFiles);
        out.put("message", "Заявка принята. Номер: #" + ticketId);
        return out;
    }

    public Map<String, Object> listDocTree() {
        requireHelpTables();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pages", listDocSectionsByKind("page"));
        out.put("modals", listDocSectionsByKind("modal"));
        return out;
    }

    public Map<String, Object> getDocArticle(String kind, String sectionSlug, String articleSlug) {
        requireHelpTables();
        String artSlug = articleSlug == null || articleSlug.isBlank() ? "guide" : articleSlug;
        Map<String, Object> row = fetchDocArticleRow(kind, sectionSlug, artSlug);
        if (row == null && kind != null && !kind.isBlank()) {
            row = fetchDocArticleRow(null, sectionSlug, artSlug);
        }
        if (row == null) {
            row = fetchFirstDocArticleRow(sectionSlug, kind);
        }
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Статья не найдена. Примените миграцию V30 или обновите страницу.");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", row.get("kind"));
        out.put("sectionSlug", row.get("section_slug"));
        out.put("sectionTitle", row.get("section_title"));
        out.put("sectionSummary", row.get("summary"));
        out.put("slug", row.get("article_slug"));
        out.put("title", row.get("article_title"));
        out.put("bodyMd", row.get("body_md"));
        return out;
    }

    public List<Map<String, Object>> searchDocs(String query) {
        requireHelpTables();
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) {
            return List.of();
        }
        String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select s.kind, s.slug as section_slug, a.slug as article_slug, a.title,
                       s.title as section_title,
                       left(regexp_replace(a.body_md, E'[\\n\\r]+', ' ', 'g'), 320) as snippet
                from help_doc_article a
                join help_doc_section s on s.id = a.section_id
                where a.is_published = true and s.is_published = true
                  and (lower(a.title) like ? or lower(a.body_md) like ? or lower(s.title) like ?)
                order by s.kind, s.position_no, a.position_no
                limit 30
                """,
                pattern, pattern, pattern
        );
        for (Map<String, Object> row : rows) {
            row.put("snippet", stripMarkdownPreview(String.valueOf(row.get("snippet"))));
        }
        return rows;
    }

    private String stripMarkdownPreview(String text) {
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

    private Map<String, Object> fetchDocArticleRow(String kind, String sectionSlug, String articleSlug) {
        if (hasDocKindColumn()) {
            if (kind == null || kind.isBlank()) {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        """
                        select a.slug as article_slug, a.title as article_title, a.body_md,
                               s.slug as section_slug, s.title as section_title, s.kind, s.summary
                        from help_doc_article a
                        join help_doc_section s on s.id = a.section_id
                        where s.slug = ? and a.slug = ?
                          and a.is_published = true and s.is_published = true
                        limit 1
                        """,
                        sectionSlug, articleSlug
                );
                return rows.isEmpty() ? null : rows.get(0);
            }
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    """
                    select a.slug as article_slug, a.title as article_title, a.body_md,
                           s.slug as section_slug, s.title as section_title, s.kind, s.summary
                    from help_doc_article a
                    join help_doc_section s on s.id = a.section_id
                    where s.kind = ? and s.slug = ? and a.slug = ?
                      and a.is_published = true and s.is_published = true
                    limit 1
                    """,
                    kind, sectionSlug, articleSlug
            );
            return rows.isEmpty() ? null : rows.get(0);
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select a.slug as article_slug, a.title as article_title, a.body_md,
                       s.slug as section_slug, s.title as section_title, 'page' as kind, s.summary
                from help_doc_article a
                join help_doc_section s on s.id = a.section_id
                where s.slug = ? and a.slug = ?
                  and a.is_published = true and s.is_published = true
                limit 1
                """,
                sectionSlug, articleSlug
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> fetchFirstDocArticleRow(String sectionSlug, String kind) {
        if (hasDocKindColumn() && kind != null && !kind.isBlank()) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    """
                    select a.slug as article_slug, a.title as article_title, a.body_md,
                           s.slug as section_slug, s.title as section_title, s.kind, s.summary
                    from help_doc_article a
                    join help_doc_section s on s.id = a.section_id
                    where s.kind = ? and s.slug = ?
                      and a.is_published = true and s.is_published = true
                    order by a.position_no, a.id
                    limit 1
                    """,
                    kind, sectionSlug
            );
            if (!rows.isEmpty()) {
                return rows.get(0);
            }
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                select a.slug as article_slug, a.title as article_title, a.body_md,
                       s.slug as section_slug, s.title as section_title,
                       coalesce(s.kind, 'page') as kind, s.summary
                from help_doc_article a
                join help_doc_section s on s.id = a.section_id
                where s.slug = ?
                  and a.is_published = true and s.is_published = true
                order by a.position_no, a.id
                limit 1
                """,
                sectionSlug
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private boolean hasDocKindColumn() {
        Integer c = jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.columns
                where table_name = 'help_doc_section' and column_name = 'kind'
                """,
                Integer.class
        );
        return c != null && c > 0;
    }

    private List<Map<String, Object>> listDocSectionsByKind(String kind) {
        List<Map<String, Object>> sections = jdbcTemplate.queryForList(
                """
                select id, slug, title, summary, position_no, kind
                from help_doc_section
                where is_published = true and kind = ?
                order by position_no, id
                """,
                kind
        );
        List<Map<String, Object>> articles = jdbcTemplate.queryForList(
                """
                select a.section_id, a.slug, a.title, a.position_no, s.slug as section_slug
                from help_doc_article a
                join help_doc_section s on s.id = a.section_id
                where a.is_published = true and s.is_published = true and s.kind = ?
                order by a.position_no, a.id
                """,
                kind
        );
        List<Map<String, Object>> tree = new ArrayList<>();
        for (Map<String, Object> section : sections) {
            long sectionId = ((Number) section.get("id")).longValue();
            String sectionSlug = String.valueOf(section.get("slug"));
            List<Map<String, Object>> sectionArticles = new ArrayList<>();
            for (Map<String, Object> article : articles) {
                if (((Number) article.get("section_id")).longValue() != sectionId) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("slug", article.get("slug"));
                item.put("title", article.get("title"));
                item.put("sectionSlug", sectionSlug);
                sectionArticles.add(item);
            }
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("kind", kind);
            node.put("slug", sectionSlug);
            node.put("title", section.get("title"));
            node.put("summary", section.get("summary"));
            node.put("articles", sectionArticles);
            tree.add(node);
        }
        return tree;
    }

    private void saveTicketAttachment(Long ticketId, MultipartFile file) {
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Файл слишком большой (макс. 10 МБ)");
        }
        String original = file.getOriginalFilename() == null ? "file"
                : Path.of(file.getOriginalFilename()).getFileName().toString();
        String ext = "";
        int dot = original.lastIndexOf('.');
        if (dot > 0) {
            ext = original.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        List<String> allowed = List.of("png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "doc", "docx", "zip");
        if (!ext.isBlank() && !allowed.contains(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Недопустимый тип файла: " + ext);
        }

        String stored = UUID.randomUUID().toString().replace("-", "") + "_" + original;
        String ym = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        Path dir = SUPPORT_UPLOADS_ROOT.resolve(ym);
        Path out = dir.resolve(stored);
        try {
            Files.createDirectories(dir);
            file.transferTo(out);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить файл");
        }

        String fileUrl = "/static/uploads/help/" + ym + "/" + stored;
        jdbcTemplate.update(
                """
                insert into help_support_attachment (ticket_id, file_name, file_url, content_type, file_size)
                values (?, ?, ?, ?, ?)
                """,
                ticketId, original, fileUrl, file.getContentType(), file.getSize()
        );
    }

    private List<Map<String, Object>> listFaqFlatGrouped() {
        List<Map<String, Object>> flat = jdbcTemplate.queryForList(
                """
                select id, question, answer
                from help_faq
                where is_published = true
                order by position_no, id
                """
        );
        Map<String, Object> block = new LinkedHashMap<>();
        block.put("slug", "general");
        block.put("title", "Частые вопросы");
        block.put("questions", flat);
        return List.of(block);
    }

    private Long currentUserId() {
        String username = requireUsername();
        Long id = jdbcTemplate.queryForObject(
                "select id from app_user where username = ? and is_active = true",
                Long.class,
                username
        );
        if (id == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден");
        }
        return id;
    }

    private Long currentTeamIdOrNull() {
        try {
            String username = requireUsername();
            return jdbcTemplate.queryForObject(
                    """
                    select t.id
                    from app_user u
                    join team_membership tm on tm.user_id = u.id
                    join app_team t on t.id = tm.team_id
                    where u.username = ?
                    order by t.id
                    limit 1
                    """,
                    Long.class,
                    username
            );
        } catch (Exception ex) {
            return null;
        }
    }

    private String requireUsername() {
        String username = currentUserProvider.getUsername();
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется авторизация");
        }
        return username;
    }

    private void requireHelpTables() {
        if (!hasTable("help_faq") || !hasTable("help_doc_section")) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Справочный раздел ещё не развёрнут (миграции V28/V29)");
        }
    }

    private void requireTicketTables() {
        if (!hasTable("help_support_ticket")) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Заявки в поддержку ещё не развёрнуты (миграция V29)");
        }
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
                tableName
        );
        return c != null && c > 0;
    }
}
