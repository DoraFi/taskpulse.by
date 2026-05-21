create table if not exists calendar_event (
    id bigserial primary key,
    public_id uuid not null default gen_random_uuid(),
    organization_id char(3) not null references organization(id) on delete cascade,
    team_id bigint references app_team(id) on delete cascade,
    title varchar(200) not null,
    description text,
    event_date date not null,
    event_end_date date,
    scope varchar(20) not null default 'team',
    created_by bigint references app_user(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_calendar_event_scope check (scope in ('organization', 'team')),
    constraint chk_calendar_event_team_scope check (
        (scope = 'organization' and team_id is null)
        or (scope = 'team' and team_id is not null)
    )
);

create unique index if not exists ux_calendar_event_public_id on calendar_event(public_id);
create index if not exists ix_calendar_event_org_date on calendar_event(organization_id, event_date);
create index if not exists ix_calendar_event_team_date on calendar_event(team_id, event_date);

insert into calendar_event (organization_id, team_id, title, description, event_date, scope, created_by)
select
    t.organization_id,
    null,
    'Корпоративный семинар',
    'Общее собрание организации',
    current_date + interval '14 days',
    'organization',
    (select min(u.id) from app_user u)
from app_team t
where not exists (select 1 from calendar_event where scope = 'organization')
order by t.id
limit 1;

insert into calendar_event (organization_id, team_id, title, description, event_date, scope, created_by)
select
    t.organization_id,
    t.id,
    'Ретроспектива команды',
    'Встреча команды',
    current_date + interval '7 days',
    'team',
    (select min(u.id) from app_user u)
from app_team t
where not exists (select 1 from calendar_event where scope = 'team')
order by t.id
limit 1;
