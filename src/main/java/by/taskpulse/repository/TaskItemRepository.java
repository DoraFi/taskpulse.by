package by.taskpulse.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.TaskItem;

public interface TaskItemRepository extends JpaRepository<TaskItem, Long> {
    List<TaskItem> findAllByBoardId(Long boardId);
}
