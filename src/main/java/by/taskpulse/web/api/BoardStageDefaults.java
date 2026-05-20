package by.taskpulse.web.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Дефолтные колонки досок (раньше хранились в seed_* таблицах). */
public final class BoardStageDefaults {

    private static final List<String> FALLBACK = List.of("Очередь", "В работе", "Тестирование", "Готово");

    private static final Map<String, List<String>> BY_PROJECT_TYPE = Map.of(
            "list", List.of("Новая", "Очередь", "В работе", "Готово"),
            "kanban", List.of("Очередь", "В работе", "Тестирование", "Готово"),
            "scrum", List.of("Очередь", "В работе", "Тестирование", "Готово", "Отложено"),
            "scrumban", List.of("Очередь", "В работе", "Тестирование", "Готово"));

    private static final Map<String, List<String>> KANBAN_BY_BOARD;

    static {
        Map<String, List<String>> boards = new LinkedHashMap<>();
        boards.put("Аналитика потока", List.of("Очередь", "В работе", "Готово"));
        boards.put("Разработка решений", List.of("Очередь", "В работе", "Тестирование", "Готово"));
        boards.put("Выпуск изменений", List.of("Очередь", "В работе", "Тестирование", "Готово"));
        KANBAN_BY_BOARD = Map.copyOf(boards);
    }

    private BoardStageDefaults() {
    }

    public static List<String> forBoard(String projectType, String boardName) {
        String pt = projectType == null || projectType.isBlank() ? "kanban" : projectType.trim().toLowerCase();
        String bn = boardName == null ? "" : boardName.trim();
        if ("kanban".equals(pt) && !bn.isEmpty()) {
            List<String> byBoard = KANBAN_BY_BOARD.get(bn);
            if (byBoard != null) {
                return new ArrayList<>(byBoard);
            }
        }
        List<String> byType = BY_PROJECT_TYPE.get(pt);
        if (byType != null) {
            return new ArrayList<>(byType);
        }
        return new ArrayList<>(FALLBACK);
    }
}
