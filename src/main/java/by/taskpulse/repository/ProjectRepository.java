package by.taskpulse.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.Project;

public interface ProjectRepository extends JpaRepository<Project, Long> {
}
