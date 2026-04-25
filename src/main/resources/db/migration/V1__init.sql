create table app_user (
    id bigserial primary key,
    email varchar(120) not null unique,
    full_name varchar(120) not null,
    password_hash varchar(255) not null
);

create table project (
    id bigserial primary key,
    name varchar(150) not null,
    owner_id bigint not null references app_user(id)
);

create table board (
    id bigserial primary key,
    name varchar(150) not null,
    project_id bigint not null references project(id)
);

create table task_item (
    id bigserial primary key,
    name varchar(200) not null,
    stage varchar(40) not null default 'Очередь',
    priority varchar(40) not null default 'обычный',
    due_date date,
    board_id bigint not null references board(id),
    assignee_id bigint references app_user(id),
    creator_id bigint references app_user(id)
);

create table subtask (
    id bigserial primary key,
    name varchar(200) not null,
    completed boolean not null default false,
    task_id bigint not null references task_item(id) on delete cascade
);

create table task_dependency (
    id bigserial primary key,
    task_id bigint not null references task_item(id) on delete cascade,
    depends_on_task_id bigint not null references task_item(id) on delete cascade,
    constraint uk_task_dependency unique (task_id, depends_on_task_id),
    constraint chk_task_dependency_self check (task_id <> depends_on_task_id)
);
