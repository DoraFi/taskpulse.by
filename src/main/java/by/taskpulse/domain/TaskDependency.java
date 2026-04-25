package by.taskpulse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "task_dependency",
    uniqueConstraints = @UniqueConstraint(columnNames = {"task_id", "depends_on_task_id"})
)
public class TaskDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    private TaskItem task;

    @ManyToOne(optional = false)
    @JoinColumn(name = "depends_on_task_id", nullable = false)
    private TaskItem dependsOnTask;

    public Long getId() {
        return id;
    }

    public TaskItem getTask() {
        return task;
    }

    public void setTask(TaskItem task) {
        this.task = task;
    }

    public TaskItem getDependsOnTask() {
        return dependsOnTask;
    }

    public void setDependsOnTask(TaskItem dependsOnTask) {
        this.dependsOnTask = dependsOnTask;
    }
}
