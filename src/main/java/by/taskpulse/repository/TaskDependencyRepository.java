package by.taskpulse.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.TaskDependency;

public interface TaskDependencyRepository extends JpaRepository<TaskDependency, Long> {
    List<TaskDependency> findAllByTaskId(Long taskId);
}
