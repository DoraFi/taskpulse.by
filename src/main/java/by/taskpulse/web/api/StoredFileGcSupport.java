package by.taskpulse.web.api;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class StoredFileGcSupport {

    private static final Logger log = LoggerFactory.getLogger(StoredFileGcSupport.class);
    private static final Path STATIC_ROOT = Path.of("static");

    private final JdbcTemplate jdbcTemplate;

    public StoredFileGcSupport(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean hasTable(String tableName) {
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

    public void deleteStoredFileIfUnreferenced(long storedFileId) {
        if (storedFileId <= 0) {
            return;
        }
        Integer refs = jdbcTemplate.queryForObject(
                """
                select
                  (select count(*) from task_attachment where stored_file_id = ?)
                  + (select count(*) from help_support_attachment where stored_file_id = ?)
                """,
                Integer.class,
                storedFileId,
                storedFileId
        );
        if (refs != null && refs > 0) {
            return;
        }

        String storagePath = null;
        try {
            Map<String, Object> f = jdbcTemplate.queryForMap(
                    "select storage_path from stored_file where id = ?",
                    storedFileId
            );
            storagePath = f.get("storage_path") == null ? null : String.valueOf(f.get("storage_path"));
        } catch (Exception ignored) {
            return;
        }

        int removed = jdbcTemplate.update("delete from stored_file where id = ?", storedFileId);
        if (removed > 0 && storagePath != null && !storagePath.isBlank()) {
            deletePhysicalStaticFile(storagePath);
        }
    }

    public void deletePhysicalStaticFile(String storagePathOrUrl) {
        if (storagePathOrUrl == null || storagePathOrUrl.isBlank()) {
            return;
        }
        String rel = storagePathOrUrl.trim().replace('\\', '/');
        if (rel.startsWith("/static/")) {
            rel = rel.substring("/static/".length());
        } else if (rel.startsWith("static/")) {
            rel = rel.substring("static/".length());
        }
        try {
            Files.deleteIfExists(STATIC_ROOT.resolve(rel));
        } catch (Exception ex) {
            log.warn("GC: failed to delete static file {}", rel, ex);
        }
    }
}
