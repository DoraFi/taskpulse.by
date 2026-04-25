package by.taskpulse.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import by.taskpulse.domain.User;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}
