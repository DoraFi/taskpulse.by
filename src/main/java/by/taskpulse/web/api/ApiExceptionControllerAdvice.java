package by.taskpulse.web.api;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(basePackageClasses = ContextApiController.class)
public class ApiExceptionControllerAdvice {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionControllerAdvice.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> illegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest()
                .body(Map.of("ok", false, "message", ex.getMessage() != null ? ex.getMessage() : "Неверные параметры"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> responseStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        String msg = ex.getReason() != null ? ex.getReason() : status.getReasonPhrase();
        return ResponseEntity.status(status).body(Map.of("ok", false, "message", msg));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> dataAccess(DataAccessException ex) {
        log.error("Ошибка доступа к данным", ex);
        Throwable root = ex.getMostSpecificCause();
        String detail = root != null && root.getMessage() != null ? root.getMessage() : ex.getMessage();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                        "ok", false,
                        "message", "Ошибка базы данных при выполнении операции",
                        "detail", detail != null ? detail : ""));
    }
}
