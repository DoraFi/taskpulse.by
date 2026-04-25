package by.taskpulse.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.Board;

public interface BoardRepository extends JpaRepository<Board, Long> {
    List<Board> findAllByProjectId(Long projectId);
}
