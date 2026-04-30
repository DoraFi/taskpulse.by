alter table task_item
    add column if not exists archived_at timestamptz;

update task_item
set archived_at = coalesce(archived_at, updated_at, now())
where stage = 'Готово';

update task_item
set archived_at = null
where stage <> 'Готово';
