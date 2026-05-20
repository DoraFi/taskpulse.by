package by.taskpulse.web;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;

public final class TeamContextSupport {

    private TeamContextSupport() {
    }

    public static Optional<Map<String, String>> resolveByTeamPublicId(JdbcTemplate jdbc, String teamPublicId) {
        if (teamPublicId == null || teamPublicId.isBlank()) {
            return Optional.empty();
        }
        String teamKey = teamPublicId.trim();
        List<Map<String, String>> rows = jdbc.query(
                """
                select trim(coalesce(org.public_id, '')) as org_public_id,
                       trim(coalesce(t.public_id, '')) as team_public_id
                from app_team t
                join organization org on org.id = t.organization_id
                where lower(trim(t.public_id)) = lower(?)
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
        if (row.get("org_public_id").isBlank() || row.get("team_public_id").isBlank()) {
            return Optional.empty();
        }
        return Optional.of(row);
    }

    public static boolean userCanAccessTeam(JdbcTemplate jdbc, String username, String teamPublicId) {
        if (username == null || username.isBlank() || teamPublicId == null || teamPublicId.isBlank()) {
            return false;
        }
        Integer count = jdbc.queryForObject(
                """
                select count(*)
                from app_user u
                join team_membership tm on tm.user_id = u.id
                join app_team t on t.id = tm.team_id
                where u.username = ?
                  and lower(trim(t.public_id)) = lower(?)
                """,
                Integer.class,
                username,
                teamPublicId.trim()
        );
        return count != null && count > 0;
    }
}
