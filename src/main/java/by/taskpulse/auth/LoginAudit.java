package by.taskpulse.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

public final class LoginAudit {

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_MONTH_TIME = DateTimeFormatter.ofPattern("d MMMM, HH:mm", new Locale("ru"));

    private LoginAudit() {
    }

    public static String clientFromUserAgent(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "Браузер · неизвестная ОС";
        }
        String ua = userAgent;
        String browser = "Браузер";
        if (ua.contains("Edg/")) {
            browser = "Edge";
        } else if (ua.contains("Firefox/")) {
            browser = "Firefox";
        } else if (ua.contains("Chrome/") || ua.contains("CriOS/")) {
            browser = "Chrome";
        } else if (ua.contains("Safari/")) {
            browser = "Safari";
        } else if (ua.contains("OPR/") || ua.contains("Opera/")) {
            browser = "Opera";
        }

        String os = "неизвестная ОС";
        if (ua.contains("Windows")) {
            os = "Windows";
        } else if (ua.contains("Mac OS X") || ua.contains("Macintosh")) {
            os = "macOS";
        } else if (ua.contains("Android")) {
            os = "Android";
        } else if (ua.contains("iPhone") || ua.contains("iPad")) {
            os = "iOS";
        } else if (ua.contains("Linux")) {
            os = "Linux";
        }
        return browser + " · " + os;
    }

    public static void recordLogin(JdbcTemplate jdbcTemplate, Long userId, String userAgent) {
        if (userId == null) {
            return;
        }
        String client = clientFromUserAgent(userAgent);
        jdbcTemplate.update(
                """
                update app_user
                set previous_login_at = last_login_at,
                    previous_login_client = last_login_client,
                    last_login_at = now(),
                    last_login_client = ?
                where id = ?
                """,
                client,
                userId);
    }

    public static String formatLoginWhen(Object timestamp, String timezoneId) {
        if (timestamp == null) {
            return "Нет данных";
        }
        ZoneId zone = resolveZone(timezoneId);
        ZonedDateTime zdt = toZoned(timestamp, zone);
        if (zdt == null) {
            return "Нет данных";
        }
        LocalDate day = zdt.toLocalDate();
        LocalDate today = LocalDate.now(zone);
        String time = zdt.format(TIME_FMT);
        if (day.equals(today)) {
            return "Сегодня, " + time;
        }
        if (day.equals(today.minusDays(1))) {
            return "Вчера, " + time;
        }
        return zdt.format(DAY_MONTH_TIME);
    }

    public static String formatLoginActivityValue(Object timestamp, String client, String timezoneId) {
        String when = formatLoginWhen(timestamp, timezoneId);
        if (client == null || client.isBlank()) {
            return when;
        }
        return when + " · " + client;
    }

    public static String timezonePlaceLabel(String timezoneId) {
        if (timezoneId == null || timezoneId.isBlank()) {
            return "";
        }
        return switch (timezoneId) {
            case "Europe/Minsk" -> "Минск";
            case "Europe/Moscow" -> "Москва";
            case "Europe/Kyiv" -> "Киев";
            case "Europe/Warsaw" -> "Варшава";
            case "Asia/Almaty" -> "Алматы";
            case "UTC" -> "UTC";
            default -> "";
        };
    }

    public static String formatSessionSubtitle(Object timestamp, String timezoneId) {
        String place = timezonePlaceLabel(timezoneId);
        String when = formatLoginWhen(timestamp, timezoneId);
        if (place.isBlank()) {
            return when;
        }
        return place + " · " + when;
    }

    public static Map<String, Object> sessionRow(boolean current, String device, Object timestamp, String timezoneId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("current", current);
        row.put("device", device == null ? "" : device);
        row.put("when", formatLoginWhen(timestamp, timezoneId));
        row.put("subtitle", formatSessionSubtitle(timestamp, timezoneId));
        return row;
    }

    private static ZoneId resolveZone(String timezoneId) {
        if (timezoneId == null || timezoneId.isBlank()) {
            return ZoneId.systemDefault();
        }
        try {
            return ZoneId.of(timezoneId.trim());
        } catch (Exception ignored) {
            return ZoneId.systemDefault();
        }
    }

    private static ZonedDateTime toZoned(Object timestamp, ZoneId zone) {
        Instant instant = null;
        if (timestamp instanceof Timestamp ts) {
            instant = ts.toInstant();
        } else if (timestamp instanceof java.time.OffsetDateTime odt) {
            instant = odt.toInstant();
        } else if (timestamp instanceof java.time.Instant ins) {
            instant = ins;
        } else if (timestamp instanceof java.time.LocalDateTime ldt) {
            instant = ldt.atZone(ZoneId.systemDefault()).toInstant();
        }
        if (instant == null) {
            return null;
        }
        return instant.atZone(zone);
    }
}
