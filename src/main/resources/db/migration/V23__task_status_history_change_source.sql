-- Источник записи: пользовательские правки vs автоматика спринта (для ленты «последние действия»).
alter table task_status_history
    add column if not exists change_source varchar(32) not null default 'user';

comment on column task_status_history.change_source is 'user | sprint_auto — sprint_auto скрывается на главной';
