package by.taskpulse.web.api;

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

    private final JdbcTemplate jdbcTemplate;
    private final StoredFileGcSupport storedFileGc;

    public SupportAttachmentGcService(JdbcTemplate jdbcTemplate, StoredFileGcSupport storedFileGc) {
        this.jdbcTemplate = jdbcTemplate;
        this.storedFileGc = storedFileGc;
    }

    @Scheduled(cron = "0 0 0 * * *")
    public void cleanupExpiredSupportAttachments() {
        if (!storedFileGc.hasTable("help_support_attachment") || !storedFileGc.hasTable("stored_file")) {
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

        for (Map<String, Object> row : expired) {
            Long storedFileId = row.get("stored_file_id") instanceof Number n ? n.longValue() : null;
            if (storedFileId == null || storedFileId <= 0) {
                continue;
            }
            storedFileGc.deleteStoredFileIfUnreferenced(storedFileId);
        }
    }
}
