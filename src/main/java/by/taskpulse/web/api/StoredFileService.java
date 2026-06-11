package by.taskpulse.web.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class StoredFileService {

    private static final Path STATIC_ROOT = Path.of("static");
    private static final Path BLOB_ROOT = STATIC_ROOT.resolve(Path.of("uploads", "blob"));

    private final JdbcTemplate jdbcTemplate;

    public StoredFileService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public StoredFile storeOrReuse(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Файл не выбран");
        }

        long size = file.getSize();
        String contentType = file.getContentType();

        Path tmp = null;
        String sha256;
        try {
            tmp = Files.createTempFile("tp-upload-", ".tmp");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream is = file.getInputStream();
                 DigestInputStream dis = new DigestInputStream(is, digest)) {
                Files.copy(dis, tmp, StandardCopyOption.REPLACE_EXISTING);
            }
            sha256 = HexFormat.of().formatHex(digest.digest());
        } catch (IOException ex) {
            safeDelete(tmp);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось прочитать файл");
        } catch (NoSuchAlgorithmException ex) {
            safeDelete(tmp);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось вычислить хэш файла");
        }

        StoredFile existing = findBySha256(sha256);
        if (existing != null) {
            safeDelete(tmp);
            return existing;
        }

        String rel = buildRelativeStoragePath(sha256);
        Path target = STATIC_ROOT.resolve(rel);
        try {
            Files.createDirectories(target.getParent());
            // On Windows ATOMIC_MOVE may fail (different volumes / unsupported). Use copy+delete.
            Files.copy(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            safeDelete(tmp);
        } catch (IOException ex) {
            safeDelete(tmp);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить файл");
        }

        String url = toStaticUrl(rel);
        try {
            Long id = jdbcTemplate.queryForObject(
                    """
                    insert into stored_file (sha256, file_size, content_type, storage_path)
                    values (?, ?, ?, ?)
                    returning id
                    """,
                    Long.class,
                    sha256, size, contentType, rel
            );
            if (id == null) throw new IllegalStateException("stored_file id");
            return new StoredFile(id, sha256, size, contentType, rel, url);
        } catch (DataIntegrityViolationException ex) {
            // race: another request inserted same sha256
            StoredFile race = findBySha256(sha256);
            if (race != null) return race;
            throw ex;
        }
    }

    public StoredFile findBySha256(String sha256) {
        if (sha256 == null || sha256.isBlank()) return null;
        return jdbcTemplate.query(
                """
                select id, sha256, file_size, content_type, storage_path
                from stored_file
                where sha256 = ?
                limit 1
                """,
                (rs) -> {
                    if (!rs.next()) return null;
                    long id = rs.getLong("id");
                    long size = rs.getLong("file_size");
                    String ct = rs.getString("content_type");
                    String path = rs.getString("storage_path");
                    return new StoredFile(id, rs.getString("sha256"), size, ct, path, toStaticUrl(path));
                },
                sha256
        );
    }

    private String buildRelativeStoragePath(String sha256) {
        String a = sha256.substring(0, 2);
        String b = sha256.substring(2, 4);
        return Path.of("uploads", "blob", a, b, sha256 + ".bin").toString().replace('\\', '/');
    }

    private String toStaticUrl(String relPathFromStaticRoot) {
        String clean = String.valueOf(relPathFromStaticRoot).replace('\\', '/');
        if (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.startsWith("static/")) clean = clean.substring("static/".length());
        return "/static/" + clean;
    }

    private void safeDelete(Path p) {
        if (p == null) return;
        try {
            Files.deleteIfExists(p);
        } catch (Exception ignored) {
        }
    }

    public record StoredFile(long id, String sha256, long size, String contentType, String storagePath, String url) {
        public Map<String, Object> toMap() {
            return Map.of(
                    "id", id,
                    "sha256", sha256,
                    "size", size,
                    "contentType", contentType == null ? "" : contentType,
                    "path", storagePath,
                    "url", url
            );
        }
    }
}

