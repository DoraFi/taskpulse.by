package by.taskpulse.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.Subtask;

public interface SubtaskRepository extends JpaRepository<Subtask, Long> {
    List<Subtask> findAllByTaskId(Long taskId);
}
