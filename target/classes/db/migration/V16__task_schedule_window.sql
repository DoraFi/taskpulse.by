alter table task_item
    add column if not exists start_date date,
    add column if not exists end_date date;

update task_item
set end_date = coalesce(end_date, due_date)
where due_date is not null;
