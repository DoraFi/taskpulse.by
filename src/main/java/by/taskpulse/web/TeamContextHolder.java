package by.taskpulse.web;

public final class TeamContextHolder {

    private static final ThreadLocal<String> TEAM_PUBLIC_ID = new ThreadLocal<>();

    private TeamContextHolder() {
    }

    public static void setTeamPublicId(String teamPublicId) {
        if (teamPublicId == null || teamPublicId.isBlank()) {
            TEAM_PUBLIC_ID.remove();
        } else {
            TEAM_PUBLIC_ID.set(teamPublicId.trim());
        }
    }

    public static String getTeamPublicId() {
        return TEAM_PUBLIC_ID.get();
    }

    public static void clear() {
        TEAM_PUBLIC_ID.remove();
    }
}
