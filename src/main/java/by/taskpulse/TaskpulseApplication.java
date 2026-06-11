package by.taskpulse;

import by.taskpulse.auth.JwtProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(JwtProperties.class)
@EnableScheduling
public class TaskpulseApplication {

    public static void main(String[] args) {
        SpringApplication.run(TaskpulseApplication.class, args);
    }
}
