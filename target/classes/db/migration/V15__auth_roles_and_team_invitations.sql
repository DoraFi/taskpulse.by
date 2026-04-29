create table if not exists app_role (
    code varchar(40) primary key,
    name varchar(120) not null,
    scope varchar(20) not null,
    description text,
    constraint chk_app_role_scope check (scope in ('organization', 'team', 'project', 'global'))
);

insert into app_role(code, name, scope, description) values
    ('organization_registrar', 'Регистратор организации', 'organization', 'Пользователь, создавший организацию'),
    ('team_admin', 'Администратор команды', 'team', 'Управляет составом команды и настройками'),
    ('project_admin', 'Администратор проекта', 'project', 'Управляет проектом и доступами'),
    ('member', 'Участник', 'team', 'Работает с задачами и досками'),
    ('observer', 'Наблюдатель', 'project', 'Имеет доступ только на просмотр')
on conflict (code) do nothing;

create table if not exists app_user_role (
    id bigserial primary key,
    user_id bigint not null references app_user(id) on delete cascade,
    role_code varchar(40) not null references app_role(code),
    organization_id char(3) references organization(id) on delete cascade,
    team_id bigint references app_team(id) on delete cascade,
    project_id bigint references project(id) on delete cascade,
    assigned_at timestamptz not null default now(),
    unique (user_id, role_code, organization_id, team_id, project_id)
);

create table if not exists team_invitation (
    id bigserial primary key,
    organization_id char(3) not null references organization(id) on delete cascade,
    team_id bigint not null references app_team(id) on delete cascade,
    invited_email varchar(160) not null,
    invited_role varchar(40) not null references app_role(code),
    status varchar(20) not null default 'sent',
    invited_by bigint not null references app_user(id) on delete cascade,
    created_at timestamptz not null default now(),
    accepted_at timestamptz,
    constraint chk_team_invitation_status check (status in ('sent', 'accepted', 'revoked'))
);

create index if not exists ix_team_invitation_team on team_invitation(team_id);
create index if not exists ix_team_invitation_email on team_invitation(invited_email);
