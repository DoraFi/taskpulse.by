package by.taskpulse.web;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

public final class TeamContextSupport {

    private static final Pattern CONTEXT_IN_URL = Pattern.compile(
            "/o/([^/]+)/t/([^/]+)");

    private static final Pattern PROJECT_CODE_IN_URL = Pattern.compile("/p/([^/]+)(?:/|$)");

    private TeamContextSupport() {
    }

    public static Optional<Map<String, String>> parseContextFromUrl(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        Matcher matcher = CONTEXT_IN_URL.matcher(url);
        if (!matcher.find()) {
            return Optional.empty();
        }
        String org = normalizePublicId(matcher.group(1));
        String team = normalizePublicId(matcher.group(2));
        if (org.isEmpty() || team.isEmpty() || "api".equalsIgnoreCase(team)) {
            return Optional.empty();
        }
        return Optional.of(Map.of(
                "org_public_id", org,
                "team_public_id", team
        ));
    }

    public static String normalizePublicId(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .replaceAll("[\\u200B-\\u200D\\uFEFF]", "")
                .trim();
    }

    public static Optional<String> parseProjectCodeFromUrl(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        Matcher matcher = PROJECT_CODE_IN_URL.matcher(url);
        if (!matcher.find()) {
            return Optional.empty();
        }
        String code = matcher.group(1);
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(code.trim());
    }

    public static Optional<Map<String, String>> resolveByTeamPublicId(JdbcTemplate jdbc, String teamPublicId) {
        String teamKey = normalizePublicId(teamPublicId);
        if (teamKey.isEmpty()) {
            return Optional.empty();
        }
        List<Map<String, String>> rows = jdbc.query(
                """
                select trim(coalesce(org.public_id, '')) as org_public_id,
                       trim(coalesce(t.public_id, '')) as team_public_id
                from app_team t
                join organization org on org.id = t.organization_id
                where lower(trim(cast(t.public_id as text))) = lower(?)
                order by t.id desc
                limit 1
                """,
                (rs, rowNum) -> Map.of(
                        "org_public_id", rs.getString("org_public_id"),
                        "team_public_id", rs.getString("team_public_id")
                ),
                teamKey
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Map<String, String> row = rows.get(0);
        String team = normalizePublicId(row.get("team_public_id"));
        if (team.isEmpty()) {
            return Optional.empty();
        }
        String org = normalizePublicId(row.get("org_public_id"));
        if (org.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(Map.of(
                "org_public_id", org,
                "team_public_id", team
        ));
    }

    public static Optional<Map<String, String>> resolveByTeamInOrg(JdbcTemplate jdbc, String orgPublicId, String teamPublicId) {
        Optional<Map<String, String>> byTeam = resolveByTeamPublicId(jdbc, teamPublicId);
        if (byTeam.isEmpty()) {
            return Optional.empty();
        }
        String orgKey = normalizePublicId(orgPublicId);
        if (orgKey.isEmpty()) {
            return byTeam;
        }
        if (!orgKey.equalsIgnoreCase(byTeam.get().get("org_public_id"))) {
            return Optional.empty();
        }
        return byTeam;
    }

    public static boolean userCanAccessTeam(JdbcTemplate jdbc, String username, String teamPublicId) {
        if (username == null || username.isBlank() || teamPublicId == null || teamPublicId.isBlank()) {
            return false;
        }
        String teamKey = normalizePublicId(teamPublicId);
        if (teamKey.isEmpty()) {
            return false;
        }
        Integer count = jdbc.queryForObject(
                """
                select count(*)
                from app_user u
                join team_membership tm on tm.user_id = u.id
                join app_team t on t.id = tm.team_id
                where u.username = ?
                  and lower(trim(cast(t.public_id as text))) = lower(?)
                """,
                Integer.class,
                username,
                teamKey
        );
        return count != null && count > 0;
    }
}
