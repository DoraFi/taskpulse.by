create index if not exists ix_task_item_archived_at
    on task_item (archived_at)
    where archived_at is not null;
