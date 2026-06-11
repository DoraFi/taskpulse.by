package by.taskpulse.web.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class TaskAttachmentGcService {

    private static final Logger log = LoggerFactory.getLogger(TaskAttachmentGcService.class);
    static final int ARCHIVED_TASK_ATTACHMENT_RETENTION_DAYS = 180;

    private final JdbcTemplate jdbcTemplate;
    private final StoredFileGcSupport storedFileGc;

    public TaskAttachmentGcService(JdbcTemplate jdbcTemplate, StoredFileGcSupport storedFileGc) {
        this.jdbcTemplate = jdbcTemplate;
        this.storedFileGc = storedFileGc;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void cleanupArchivedTaskAttachments() {
        if (!storedFileGc.hasTable("task_attachment") || !storedFileGc.hasTable("task_item")) {
            return;
        }
        if (!hasColumn("task_item", "archived_at")) {
            return;
        }

        List<Map<String, Object>> expired = jdbcTemplate.queryForList(
                """
                select ta.id as attachment_id,
                       ta.file_url,
                       ta.stored_file_id
                from task_attachment ta
                join task_item t on t.id = ta.task_id
                where t.archived_at is not null
                  and t.archived_at < now() - (? * interval '1 day')
                order by ta.id
                limit 500
                """,
                ARCHIVED_TASK_ATTACHMENT_RETENTION_DAYS
        );
        if (expired.isEmpty()) {
            return;
        }

        Set<Long> storedFileIds = new LinkedHashSet<>();
        int deletedAttachments = 0;
        for (Map<String, Object> row : expired) {
            Long attachmentId = row.get("attachment_id") instanceof Number n ? n.longValue() : null;
            if (attachmentId == null || attachmentId <= 0) {
                continue;
            }
            Long storedFileId = row.get("stored_file_id") instanceof Number n ? n.longValue() : null;
            String fileUrl = row.get("file_url") == null ? null : String.valueOf(row.get("file_url"));

            int removed = jdbcTemplate.update("delete from task_attachment where id = ?", attachmentId);
            if (removed <= 0) {
                continue;
            }
            deletedAttachments++;

            if (storedFileId != null && storedFileId > 0) {
                storedFileIds.add(storedFileId);
            } else if (fileUrl != null && !fileUrl.isBlank()) {
                storedFileGc.deletePhysicalStaticFile(fileUrl);
            }
        }

        for (Long storedFileId : storedFileIds) {
            storedFileGc.deleteStoredFileIfUnreferenced(storedFileId);
        }

        if (deletedAttachments > 0) {
            log.info(
                    "GC: deleted {} task attachments archived more than {} days ago",
                    deletedAttachments,
                    ARCHIVED_TASK_ATTACHMENT_RETENTION_DAYS
            );
        }
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
                tableName,
                columnName
        );
        return c != null && c > 0;
    }
}
