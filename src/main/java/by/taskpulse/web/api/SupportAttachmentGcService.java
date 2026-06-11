package by.taskpulse.web.api;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SupportAttachmentGcService {

    private static final Logger log = LoggerFactory.getLogger(SupportAttachmentGcService.class);
    private static final Path STATIC_ROOT = Path.of("static");

    private final JdbcTemplate jdbcTemplate;

    public SupportAttachmentGcService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Scheduled(cron = "0 15 3 * * *") // daily 03:15
    public void cleanupExpiredSupportAttachments() {
        if (!hasTable("help_support_attachment") || !hasTable("stored_file")) {
            return;
        }

        List<Map<String, Object>> expired = jdbcTemplate.queryForList(
                """
                select distinct a.stored_file_id
                from help_support_attachment a
                where a.expires_at is not null
                  and a.expires_at < now()
                  and a.stored_file_id is not null
                limit 500
                """
        );

        int deletedRows = jdbcTemplate.update(
                "delete from help_support_attachment where expires_at is not null and expires_at < now()"
        );
        if (deletedRows > 0) {
            log.info("GC: deleted {} expired help attachments", deletedRows);
        }

        // Remove stored_file rows that are no longer referenced by any attachment table.
        for (Map<String, Object> row : expired) {
            Long storedFileId = row.get("stored_file_id") instanceof Number n ? n.longValue() : null;
            if (storedFileId == null || storedFileId <= 0) continue;

            Integer refs = jdbcTemplate.queryForObject(
                    """
                    select
                      (select count(*) from task_attachment where stored_file_id = ?)
                      + (select count(*) from help_support_attachment where stored_file_id = ?)
                    """,
                    Integer.class,
                    storedFileId, storedFileId
            );
            if (refs != null && refs > 0) continue;

            String storagePath = null;
            try {
                Map<String, Object> f = jdbcTemplate.queryForMap(
                        "select storage_path from stored_file where id = ?",
                        storedFileId
                );
                storagePath = f.get("storage_path") == null ? null : String.valueOf(f.get("storage_path"));
            } catch (Exception ignored) {
                // file already removed
            }

            int removed = jdbcTemplate.update("delete from stored_file where id = ?", storedFileId);
            if (removed > 0 && storagePath != null && !storagePath.isBlank()) {
                try {
                    Files.deleteIfExists(STATIC_ROOT.resolve(storagePath));
                } catch (Exception ex) {
                    log.warn("GC: failed to delete stored file {}", storagePath, ex);
                }
            }
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

