create table organization (
    id char(3) primary key,
    name varchar(180) not null,
    created_at timestamptz not null default now(),
    constraint chk_organization_id_format check (id ~ '^[A-Z]{3}$')
);

alter table app_user
    add column organization_id char(3) references organization(id),
    add column username varchar(80),
    add column is_active boolean not null default true,
    add column created_at timestamptz not null default now();

create unique index if not exists ux_app_user_username on app_user(username) where username is not null;
create index if not exists ix_app_user_org on app_user(organization_id);

create table app_team (
    id bigserial primary key,
    organization_id char(3) not null references organization(id),
    code char(3) not null,
    name varchar(140) not null,
    lead_user_id bigint references app_user(id),
    created_at timestamptz not null default now(),
    constraint chk_team_code_format check (code ~ '^[A-Z]{3}$'),
    constraint uk_team_org_code unique (organization_id, code)
);

create table team_membership (
    team_id bigint not null references app_team(id) on delete cascade,
    user_id bigint not null references app_user(id) on delete cascade,
    role varchar(32) not null default 'member',
    joined_at timestamptz not null default now(),
    primary key (team_id, user_id),
    constraint chk_team_membership_role check (role in ('lead', 'member', 'viewer'))
);

alter table project
    add column organization_id char(3) references organization(id),
    add column code char(3),
    add column summary text,
    add column created_at timestamptz not null default now(),
    add constraint chk_project_code_format check (code is null or code ~ '^[A-Z]{3}$');

create unique index if not exists ux_project_org_code on project(organization_id, code) where code is not null;
create index if not exists ix_project_org on project(organization_id);

create table project_team (
    project_id bigint not null references project(id) on delete cascade,
    team_id bigint not null references app_team(id) on delete cascade,
    primary key (project_id, team_id)
);

create table project_member (
    project_id bigint not null references project(id) on delete cascade,
    user_id bigint not null references app_user(id) on delete cascade,
    role varchar(32) not null default 'contributor',
    primary key (project_id, user_id),
    constraint chk_project_member_role check (role in ('owner', 'manager', 'contributor', 'observer'))
);

alter table board
    add column code varchar(24),
    add column created_at timestamptz not null default now();

create unique index if not exists ux_board_project_code on board(project_id, code) where code is not null;

alter table task_item
    add column task_code varchar(24),
    add column description text,
    add column story_points integer,
    add column estimate_hours numeric(8,2),
    add column spent_hours numeric(8,2),
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now(),
    add constraint chk_task_code_format check (task_code is null or task_code ~ '^[A-Z]{3}-[0-9]+$'),
    add constraint chk_story_points check (story_points is null or story_points between 1 and 21),
    add constraint chk_hours_non_negative check (
        (estimate_hours is null or estimate_hours >= 0)
        and (spent_hours is null or spent_hours >= 0)
    );

create unique index if not exists ux_task_item_task_code on task_item(task_code) where task_code is not null;
create index if not exists ix_task_item_due_date on task_item(due_date);
create index if not exists ix_task_item_stage on task_item(stage);
create index if not exists ix_task_item_priority on task_item(priority);

create table task_comment (
    id bigserial primary key,
    task_id bigint not null references task_item(id) on delete cascade,
    author_id bigint not null references app_user(id),
    body text not null,
    created_at timestamptz not null default now()
);

create table task_attachment (
    id bigserial primary key,
    task_id bigint not null references task_item(id) on delete cascade,
    uploaded_by bigint not null references app_user(id),
    file_name varchar(255) not null,
    file_url varchar(500) not null,
    created_at timestamptz not null default now()
);

create table task_label (
    id bigserial primary key,
    organization_id char(3) not null references organization(id),
    name varchar(50) not null,
    color varchar(7) not null,
    constraint chk_task_label_color check (color ~ '^#[0-9A-Fa-f]{6}$'),
    constraint uk_task_label_org_name unique (organization_id, name)
);

create table task_item_label (
    task_id bigint not null references task_item(id) on delete cascade,
    label_id bigint not null references task_label(id) on delete cascade,
    primary key (task_id, label_id)
);

create table task_status_history (
    id bigserial primary key,
    task_id bigint not null references task_item(id) on delete cascade,
    changed_by bigint not null references app_user(id),
    old_stage varchar(40),
    new_stage varchar(40) not null,
    changed_at timestamptz not null default now()
);
