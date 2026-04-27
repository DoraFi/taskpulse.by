package by.taskpulse.config;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class JsonDatabaseSeeder implements ApplicationRunner {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final int DEMO_DATE_SHIFT_DAYS = 25;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;

    public JsonDatabaseSeeder(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, ResourceLoader resourceLoader) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.resourceLoader = resourceLoader;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        seedFromJson();
    }

    private void seedFromJson() throws IOException {
        JsonNode team = readJson("file:./static/data/team.json");
        JsonNode boardsJson = readJson("file:./static/data/boards.json");
        JsonNode kanbanBoardsJson = readJson("file:./static/data/kanban.json");
        JsonNode kanbanTasksJson = readJson("file:./static/data/kanban_tasks.json");
        JsonNode tasksJson = readJson("file:./static/data/tasks.json");

        truncateAll();

        jdbcTemplate.update("insert into organization(id, name) values ('TPB', 'TaskPulse BY')");
        jdbcTemplate.update(
                "insert into app_team(organization_id, code, name) values ('TPB', 'DEV', 'Команда разработки TaskPulse')");
        Long teamId = jdbcTemplate.queryForObject("select id from app_team where organization_id='TPB' and code='DEV'", Long.class);

        Map<String, Long> userByName = new HashMap<>();
        for (JsonNode person : team) {
            String name = text(person, "name");
            String role = text(person, "role");
            String avatar = text(person, "avatar");
            String username = toUsername(name);
            String email = username + "@taskpulse.by";
            jdbcTemplate.update(
                    """
                    insert into app_user(
                      email, full_name, password_hash, organization_id, username, is_active,
                      phone, timezone, office, bio, department, position, avatar_file, team_joined_at
                    ) values (?, ?, ?, 'TPB', ?, true, ?, 'Europe/Minsk', ?, ?, ?, ?, ?, ?)
                    """,
                    email,
                    name,
                    "$2a$10$json.seed.password",
                    username,
                    "+375 (29) 000-00-00",
                    "Минск",
                    "Участник команды TaskPulse",
                    "Разработка",
                    role,
                    avatar == null || avatar.isBlank() ? "basic_avatar.png" : avatar,
                    Date.valueOf(LocalDate.of(2024, 10, 1))
            );
            Long userId = jdbcTemplate.queryForObject("select id from app_user where username = ?", Long.class, username);
            userByName.put(name, userId);
            jdbcTemplate.update(
                    "insert into team_membership(team_id, user_id, role) values (?, ?, ?)",
                    teamId,
                    userId,
                    "Дарья Швед".equals(name) ? "lead" : "member"
            );
        }

        Long ownerId = userByName.getOrDefault("Дарья Швед",
                jdbcTemplate.queryForObject("select min(id) from app_user", Long.class));

        jdbcTemplate.update(
                "insert into project(name, owner_id, organization_id, code, summary) values (?, ?, 'TPB', 'LST', ?)",
                "Проект Список",
                ownerId,
                "Списки и табличное управление задачами команды"
        );
        jdbcTemplate.update(
                "insert into project(name, owner_id, organization_id, code, summary) values (?, ?, 'TPB', 'WCL', ?)",
                "Проект Kanban",
                ownerId,
                "Kanban-доски и поток задач команды"
        );
        Long listProjectId = jdbcTemplate.queryForObject("select id from project where code='LST'", Long.class);
        Long kanProjectId = jdbcTemplate.queryForObject("select id from project where code='WCL'", Long.class);

        jdbcTemplate.update("insert into project_team(project_id, team_id) values (?, ?)", listProjectId, teamId);
        jdbcTemplate.update("insert into project_team(project_id, team_id) values (?, ?)", kanProjectId, teamId);

        for (Map.Entry<String, Long> e : userByName.entrySet()) {
            String role = "contributor";
            if ("Дарья Швед".equals(e.getKey())) role = "owner";
            if ("Оксана Кветко".equals(e.getKey())) role = "manager";
            jdbcTemplate.update("insert into project_member(project_id, user_id, role) values (?, ?, ?)", listProjectId, e.getValue(), role);
            jdbcTemplate.update("insert into project_member(project_id, user_id, role) values (?, ?, ?)", kanProjectId, e.getValue(), role);
        }

        Map<Long, Long> listBoardIdMap = new HashMap<>();
        Set<String> usedTaskCodes = new HashSet<>();
        for (JsonNode b : boardsJson.path("boards")) {
            long originalId = b.path("id").asLong();
            String boardName = text(b, "name");
            jdbcTemplate.update(
                    "insert into board(id, name, project_id, code) values (?, ?, ?, ?)",
                    originalId,
                    boardName,
                    listProjectId,
                    "LIST_" + originalId
            );
            listBoardIdMap.put(originalId, originalId);
        }

        Map<Long, Long> kanbanBoardIdMap = new HashMap<>();
        for (JsonNode b : kanbanBoardsJson.path("boards")) {
            long originalId = b.path("id").asLong();
            String boardName = text(b, "name");
            jdbcTemplate.update(
                    "insert into board(id, name, project_id, code) values (?, ?, ?, ?)",
                    1000 + originalId,
                    boardName,
                    kanProjectId,
                    "KANBAN_" + originalId
            );
            kanbanBoardIdMap.put(originalId, 1000 + originalId);
        }

        for (JsonNode boardNode : boardsJson.path("boards")) {
            long boardId = listBoardIdMap.get(boardNode.path("id").asLong());
            for (JsonNode task : boardNode.path("tasks")) {
                insertTask(task, boardId, userByName, "LST", usedTaskCodes);
            }
        }

        for (JsonNode task : kanbanTasksJson.path("tasks")) {
            long srcBoardId = task.path("boardId").asLong();
            Long mapped = kanbanBoardIdMap.get(srcBoardId);
            if (mapped == null) continue;
            insertTask(task, mapped, userByName, "WCL", usedTaskCodes);
        }

        long backlogBoardId = 1999L;
        jdbcTemplate.update(
                "insert into board(id, name, project_id, code) values (?, ?, ?, ?)",
                backlogBoardId,
                "Бэклог команды",
                listProjectId,
                "LIST_BACKLOG"
        );
        long syntheticId = 50000L;
        for (JsonNode task : tasksJson) {
            String code = text(task, "id");
            String name = text(task, "name");
            String priority = text(task, "priority");
            String dueDate = text(task, "dueDate");
            String assignee = text(task, "assignee");
            String creator = text(task, "creator");
            String status = text(task, "status");
            Integer sp = task.hasNonNull("complexity") ? task.path("complexity").asInt() : null;
            String timeEstimate = text(task, "timeEstimate");
            BigDecimal estimate = parseHours(timeEstimate);

            if (code == null || code.isBlank() || usedTaskCodes.contains(code)) {
                code = uniqueTaskCode("WCL", syntheticId, usedTaskCodes);
            } else {
                usedTaskCodes.add(code);
            }

            jdbcTemplate.update(
                    """
                    insert into task_item(
                      id, name, stage, priority, due_date, board_id, assignee_id, creator_id, task_code,
                      description, story_points, estimate_hours, spent_hours, created_at, updated_at
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                    """,
                    syntheticId++,
                    name,
                    fromLegacyStatus(status),
                    priority == null || priority.isBlank() ? "обычный" : priority,
                    parseDate(dueDate),
                    backlogBoardId,
                    userByName.get(assignee),
                    userByName.get(creator),
                    code,
                    "Импортировано из tasks.json",
                    sp,
                    estimate,
                    BigDecimal.ZERO
            );
        }

        jdbcTemplate.execute("select setval('board_id_seq', (select max(id) from board))");
        jdbcTemplate.execute("select setval('task_item_id_seq', (select max(id) from task_item))");
        backfillSubtaskPublicIds();
    }

    private void insertTask(JsonNode task, long boardId, Map<String, Long> userByName, String prefix, Set<String> usedTaskCodes) {
        long id = task.path("id").asLong();
        String name = text(task, "name");
        String priority = text(task, "priority");
        String dueDate = text(task, "dueDate");
        String assignee = text(task, "assignee");
        String stage = text(task, "stage");
        String code = prefix + "-" + id;
        if (task.hasNonNull("displayId")) {
            String displayId = text(task, "displayId");
            if (displayId != null && displayId.matches("^[A-Z]{3}-\\d+$")) {
                code = displayId;
            }
        }
        if (usedTaskCodes.contains(code)) {
            code = uniqueTaskCode(prefix, id, usedTaskCodes);
        } else {
            usedTaskCodes.add(code);
        }

        Long assigneeId = userByName.get(assignee);
        Long creatorId = userByName.getOrDefault("Дарья Швед", assigneeId);
        if (creatorId == null && !userByName.isEmpty()) creatorId = userByName.values().iterator().next();

        Integer storyPoints = null;
        if (task.hasNonNull("storyPoints")) {
            storyPoints = Integer.valueOf(task.path("storyPoints").asInt());
        } else if (task.hasNonNull("complexity")) {
            storyPoints = Integer.valueOf(task.path("complexity").asInt());
        }
        BigDecimal estimate = task.hasNonNull("timeEstimateHours")
                ? BigDecimal.valueOf(task.path("timeEstimateHours").asDouble())
                : parseHours(text(task, "timeEstimate"));

        jdbcTemplate.update(
                """
                insert into task_item(
                  id, name, stage, priority, due_date, board_id, assignee_id, creator_id, task_code,
                  description, story_points, estimate_hours, spent_hours, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                """,
                id,
                name,
                stage == null || stage.isBlank() ? "Очередь" : stage,
                priority == null || priority.isBlank() ? "обычный" : priority,
                parseDate(dueDate),
                boardId,
                assigneeId,
                creatorId,
                code,
                "Импортировано из JSON",
                storyPoints,
                estimate,
                BigDecimal.ZERO
        );

        if (task.has("subtasks")) {
            Iterator<JsonNode> it = task.path("subtasks").elements();
            int ordinal = 1;
            while (it.hasNext()) {
                JsonNode st = it.next();
                jdbcTemplate.update(
                        "insert into subtask(name, completed, task_id, public_id) values (?, ?, ?, ?)",
                        text(st, "name"),
                        st.path("completed").asBoolean(false),
                        id,
                        code + "-" + (ordinal++)
                );
            }
        }
    }

    private void truncateAll() {
        jdbcTemplate.execute("""
                truncate table
                    task_item_label,
                    task_label,
                    task_attachment,
                    task_comment,
                    task_status_history,
                    task_dependency,
                    subtask,
                    task_item,
                    board,
                    project_member,
                    project_team,
                    project,
                    team_membership,
                    app_team,
                    app_user,
                    organization
                restart identity cascade
                """);
    }

    private void backfillSubtaskPublicIds() {
        jdbcTemplate.execute("""
                with ranked as (
                    select
                        s.id as sid,
                        t.task_code || '-' || row_number() over(partition by s.task_id order by s.id) as pid
                    from subtask s
                    join task_item t on t.id = s.task_id
                )
                update subtask s
                set public_id = r.pid
                from ranked r
                where s.id = r.sid
                """);
    }

    private JsonNode readJson(String location) throws IOException {
        Resource resource = resourceLoader.getResource(location);
        return objectMapper.readTree(resource.getInputStream());
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }

    private Date parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        return Date.valueOf(LocalDate.parse(value, DATE_FMT).plusDays(DEMO_DATE_SHIFT_DAYS));
    }

    private String toUsername(String fullName) {
        if (fullName == null || fullName.isBlank()) return "user";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length >= 2) {
            return translit(parts[0].charAt(0) + "." + parts[1]).toLowerCase();
        }
        return translit(fullName).toLowerCase();
    }

    private String translit(String s) {
        return s
                .replace("А", "A").replace("Б", "B").replace("В", "V").replace("Г", "G").replace("Д", "D")
                .replace("Е", "E").replace("Ё", "E").replace("Ж", "Zh").replace("З", "Z").replace("И", "I")
                .replace("Й", "Y").replace("К", "K").replace("Л", "L").replace("М", "M").replace("Н", "N")
                .replace("О", "O").replace("П", "P").replace("Р", "R").replace("С", "S").replace("Т", "T")
                .replace("У", "U").replace("Ф", "F").replace("Х", "H").replace("Ц", "Ts").replace("Ч", "Ch")
                .replace("Ш", "Sh").replace("Щ", "Sch").replace("Ы", "Y").replace("Э", "E").replace("Ю", "Yu")
                .replace("Я", "Ya")
                .replace("а", "a").replace("б", "b").replace("в", "v").replace("г", "g").replace("д", "d")
                .replace("е", "e").replace("ё", "e").replace("ж", "zh").replace("з", "z").replace("и", "i")
                .replace("й", "y").replace("к", "k").replace("л", "l").replace("м", "m").replace("н", "n")
                .replace("о", "o").replace("п", "p").replace("р", "r").replace("с", "s").replace("т", "t")
                .replace("у", "u").replace("ф", "f").replace("х", "h").replace("ц", "ts").replace("ч", "ch")
                .replace("ш", "sh").replace("щ", "sch").replace("ы", "y").replace("э", "e").replace("ю", "yu")
                .replace("я", "ya")
                .replaceAll("[^a-zA-Z0-9._-]", "");
    }

    private String fromLegacyStatus(String status) {
        if (status == null) return "Очередь";
        return switch (status) {
            case "inprocess" -> "В работе";
            case "done" -> "Готово";
            case "exit" -> "Отложено";
            default -> "Очередь";
        };
    }

    private BigDecimal parseHours(String text) {
        if (text == null || text.isBlank()) return BigDecimal.valueOf(8);
        String cleaned = text.replace("ч", "").replace(",", ".").trim();
        try {
            return new BigDecimal(cleaned);
        } catch (Exception ignored) {
            return BigDecimal.valueOf(8);
        }
    }

    private String uniqueTaskCode(String prefix, long baseId, Set<String> usedTaskCodes) {
        String candidate = prefix + "-" + baseId;
        long n = baseId;
        while (usedTaskCodes.contains(candidate)) {
            n++;
            candidate = prefix + "-" + n;
        }
        usedTaskCodes.add(candidate);
        return candidate;
    }
}
