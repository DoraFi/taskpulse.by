package by.taskpulse.config;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(prefix = "app.seed", name = "enabled", havingValue = "true")
public class JsonDatabaseSeeder implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public JsonDatabaseSeeder(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedFromDatabase();
    }

    private void seedFromDatabase() {
        truncateAll();

        jdbcTemplate.update("insert into organization(id, name) values ('TPB', 'TaskPulse BY')");
        jdbcTemplate.update("insert into app_team(organization_id, code, name) values ('TPB', 'DEV', 'Команда разработки TaskPulse')");
        Long teamId = jdbcTemplate.queryForObject("select id from app_team where organization_id='TPB' and code='DEV'", Long.class);

        List<Map<String, Object>> members = jdbcTemplate.queryForList(
                "select full_name, role_label, avatar_file, is_lead from seed_team_member order by position_no");
        Map<String, Long> userByName = new HashMap<>();
        for (Map<String, Object> m : members) {
            String name = String.valueOf(m.get("full_name"));
            String role = String.valueOf(m.get("role_label"));
            String avatar = m.get("avatar_file") == null ? "basic_avatar.png" : String.valueOf(m.get("avatar_file"));
            String username = toUsername(name);
            String email = username + "@taskpulse.by";
            jdbcTemplate.update(
                    """
                    insert into app_user(
                      email, full_name, password_hash, organization_id, username, is_active,
                      phone, timezone, office, bio, department, position, avatar_file, team_joined_at
                    ) values (?, ?, ?, 'TPB', ?, true, ?, 'Europe/Minsk', ?, ?, ?, ?, ?, ?)
                    """,
                    email, name, "$2a$10$json.seed.password", username,
                    "+375 (29) 000-00-00", "Минск", "Участник команды TaskPulse",
                    "Разработка", role, avatar, Date.valueOf(LocalDate.of(2024, 10, 1))
            );
            Long uid = jdbcTemplate.queryForObject("select id from app_user where username = ?", Long.class, username);
            userByName.put(name, uid);
            String membershipRole = Boolean.TRUE.equals(m.get("is_lead")) ? "lead" : "member";
            jdbcTemplate.update("insert into team_membership(team_id, user_id, role) values (?, ?, ?)", teamId, uid, membershipRole);
        }

        Long ownerId = userByName.getOrDefault("Дарья Швед", jdbcTemplate.queryForObject("select min(id) from app_user", Long.class));
        List<Map<String, Object>> templates = jdbcTemplate.queryForList(
                "select code, project_type, name, summary, board_count, tasks_per_stage from seed_project_template order by id");

        Map<String, Long> projectIdByCode = new HashMap<>();
        for (Map<String, Object> t : templates) {
            String code = String.valueOf(t.get("code"));
            String type = String.valueOf(t.get("project_type"));
            String name = String.valueOf(t.get("name"));
            String summary = t.get("summary") == null ? "" : String.valueOf(t.get("summary"));
            jdbcTemplate.update(
                    "insert into project(name, owner_id, organization_id, code, project_type, summary) values (?, ?, 'TPB', ?, ?, ?)",
                    name, ownerId, code, type, summary
            );
            Long pid = jdbcTemplate.queryForObject("select id from project where code = ?", Long.class, code);
            projectIdByCode.put(code, pid);
            jdbcTemplate.update("insert into project_team(project_id, team_id) values (?, ?)", pid, teamId);
            for (Map.Entry<String, Long> e : userByName.entrySet()) {
                String role = "contributor";
                if ("Дарья Швед".equals(e.getKey())) role = "owner";
                if ("Оксана Кветко".equals(e.getKey())) role = "manager";
                jdbcTemplate.update("insert into project_member(project_id, user_id, role) values (?, ?, ?)", pid, e.getValue(), role);
            }
        }

        long nextBoardId = 1L;
        long nextTaskId = 1L;
        LocalDate baseDate = LocalDate.of(2026, 4, 26);
        List<Long> creatorPool = new ArrayList<>(userByName.values());
        List<Long> assigneePool = new ArrayList<>(userByName.values());

        for (Map<String, Object> t : templates) {
            String projectCode = String.valueOf(t.get("code"));
            String projectType = String.valueOf(t.get("project_type"));
            int boardCount = ((Number) t.get("board_count")).intValue();
            int tasksPerStage = ((Number) t.get("tasks_per_stage")).intValue();
            Long projectId = projectIdByCode.get(projectCode);

            List<Map<String, Object>> boardTemplates = jdbcTemplate.queryForList(
                    "select board_name from seed_board_template where project_type = ? order by position_no", projectType);
            for (int bi = 0; bi < boardCount; bi++) {
                if (boardTemplates.isEmpty() || bi >= boardTemplates.size()) {
                    throw new IllegalStateException(
                            "Недостаточно шаблонов досок в seed_board_template для project_type=" + projectType);
                }
                String boardName = String.valueOf(boardTemplates.get(bi).get("board_name"));
                String boardCode = projectType.toUpperCase() + "_" + (bi + 1);
                long boardId = nextBoardId++;
                jdbcTemplate.update("insert into board(id, name, project_id, code) values (?, ?, ?, ?)", boardId, boardName, projectId, boardCode);
                List<String> titles = jdbcTemplate.query(
                        """
                        select title
                        from seed_task_catalog
                        where project_type = ?
                          and board_name = ?
                        order by id
                        """,
                        (rs, rowNum) -> rs.getString("title"),
                        projectType,
                        boardName
                );
                if (titles.isEmpty()) {
                    throw new IllegalStateException(
                            "В seed_task_catalog нет задач для project_type=" + projectType + ", board_name=" + boardName);
                }
                int titleIndex = 0;
                List<String> boardStages = jdbcTemplate.query(
                        """
                        select stage_name
                        from seed_board_stage_template
                        where project_type = ?
                          and board_name = ?
                        order by position_no
                        """,
                        (rs, rowNum) -> rs.getString("stage_name"),
                        projectType,
                        boardName
                );
                if (boardStages.isEmpty()) {
                    boardStages = jdbcTemplate.query(
                            "select stage_name from seed_stage_template where project_type = ? order by position_no",
                            (rs, rowNum) -> rs.getString("stage_name"),
                            projectType
                    );
                }
                if (boardStages.isEmpty()) {
                    throw new IllegalStateException("В seed_stage_template нет этапов для project_type=" + projectType);
                }

                for (int si = 0; si < boardStages.size(); si++) {
                    jdbcTemplate.update(
                            "insert into board_stage(board_id, stage_name, position) values (?, ?, ?)",
                            boardId, boardStages.get(si), si + 1
                    );
                    for (int k = 0; k < tasksPerStage; k++) {
                        long taskId = nextTaskId++;
                        String stage = boardStages.get(si);
                        if (titleIndex >= titles.size()) {
                            throw new IllegalStateException(
                                    "Недостаточно уникальных задач в seed_task_catalog для project_type=" + projectType
                                            + ". Требуется минимум " + (titleIndex + 1) + ", а загружено " + titles.size());
                        }
                        String taskName = titles.get(titleIndex++);
                        String priority = (taskId % 5 == 0) ? "срочно" : "обычный";
                        LocalDate dueDate = baseDate.plusDays((int) ((taskId * 5 + bi * 3 + si) % 75) - 2);
                        LocalDate createdDate = dueDate.minusDays(4 + (taskId % 4));
                        LocalDate updatedDate = "Готово".equals(stage) ? dueDate.plusDays(1) : createdDate.plusDays(2);
                        Long creatorId = creatorPool.get((int) (taskId % creatorPool.size()));

                        Long assigneeId = null;
                        if ("Очередь".equals(stage)) {
                            if (taskId % 7 == 0 && !assigneePool.isEmpty()) {
                                assigneeId = assigneePool.get((int) (taskId % assigneePool.size()));
                            }
                        } else if (!assigneePool.isEmpty()) {
                            assigneeId = assigneePool.get((int) (taskId % assigneePool.size()));
                        }
                        if (taskId % 23 == 0) assigneeId = ownerId;

                        String taskCode = projectCode + "-" + taskId;
                        jdbcTemplate.update(
                                """
                                insert into task_item(
                                  id, name, stage, priority, due_date, board_id, assignee_id, creator_id, task_code,
                                  description, story_points, estimate_hours, spent_hours, created_at, updated_at
                                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                taskId,
                                taskName,
                                stage,
                                priority,
                                Date.valueOf(dueDate),
                                boardId,
                                assigneeId,
                                creatorId,
                                taskCode,
                                "Автогенерация из seed-конфигурации БД",
                                Integer.valueOf((int) ((taskId % 8) + 1)),
                                BigDecimal.valueOf((taskId % 9) + 2),
                                BigDecimal.valueOf("Готово".equals(stage) ? (taskId % 6) + 1 : 0),
                                Timestamp.valueOf(createdDate.atTime(10, 0)),
                                Timestamp.valueOf(updatedDate.atTime(16, 0))
                        );
                        jdbcTemplate.update(
                                "insert into task_status_history(task_id, changed_by, old_stage, new_stage, changed_at) values (?, ?, ?, ?, ?)",
                                taskId,
                                assigneeId != null ? assigneeId : creatorId,
                                "Очередь",
                                stage,
                                Timestamp.valueOf(updatedDate.atTime(17, 0))
                        );
                        if (taskId % 2 == 0) {
                            jdbcTemplate.update(
                                    "insert into subtask(name, completed, task_id, public_id) values (?, ?, ?, ?)",
                                    "Подготовить уточнения по задаче",
                                    "Готово".equals(stage),
                                    taskId,
                                    taskCode + "-1"
                            );
                            jdbcTemplate.update(
                                    "insert into subtask(name, completed, task_id, public_id) values (?, ?, ?, ?)",
                                    "Выполнить проверку результата",
                                    "Готово".equals(stage),
                                    taskId,
                                    taskCode + "-2"
                            );
                        }
                    }
                }
            }
        }

        jdbcTemplate.execute("select setval('board_id_seq', (select max(id) from board))");
        jdbcTemplate.execute("select setval('task_item_id_seq', (select max(id) from task_item))");
        backfillSubtaskPublicIds();
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
                    board_stage,
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

}
