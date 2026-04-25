-- Scalable external identifiers for core entities.
-- Internal bigint PKs stay unchanged for joins/performance.
-- public_id is stable, unique and safe for external references.

alter table organization
    add column if not exists public_id varchar(20);

alter table app_team
    add column if not exists public_id varchar(20);

alter table app_user
    add column if not exists public_id varchar(20);

alter table task_item
    add column if not exists public_id varchar(20);

alter table subtask
    add column if not exists public_id varchar(20);

-- Backfill existing rows
update organization o
set public_id = 'ORG-' || lpad(x.rn::text, 8, '0')
from (
    select id, row_number() over(order by id) as rn
    from organization
) x
where o.id = x.id
  and o.public_id is null;

update app_team t
set public_id = 'TEAM-' || lpad(t.id::text, 8, '0')
where t.public_id is null;

update app_user u
set public_id = 'USR-' || lpad(u.id::text, 10, '0')
where u.public_id is null;

update task_item t
set public_id = 'TSK-' || lpad(t.id::text, 12, '0')
where t.public_id is null;

update subtask s
set public_id = 'SUB-' || lpad(s.id::text, 12, '0')
where s.public_id is null;

-- Constraints + indexes
alter table organization
    alter column public_id set not null;
alter table app_team
    alter column public_id set not null;
alter table app_user
    alter column public_id set not null;
alter table task_item
    alter column public_id set not null;
alter table subtask
    alter column public_id set not null;

create unique index if not exists ux_organization_public_id on organization(public_id);
create unique index if not exists ux_app_team_public_id on app_team(public_id);
create unique index if not exists ux_app_user_public_id on app_user(public_id);
create unique index if not exists ux_task_item_public_id on task_item(public_id);
create unique index if not exists ux_subtask_public_id on subtask(public_id);

alter table organization
    drop constraint if exists chk_organization_public_id_format;
alter table app_team
    drop constraint if exists chk_app_team_public_id_format;
alter table app_user
    drop constraint if exists chk_app_user_public_id_format;
alter table task_item
    drop constraint if exists chk_task_item_public_id_format;
alter table subtask
    drop constraint if exists chk_subtask_public_id_format;

alter table organization
    add constraint chk_organization_public_id_format
    check (public_id ~ '^ORG-[0-9]{8}$');
alter table app_team
    add constraint chk_app_team_public_id_format
    check (public_id ~ '^TEAM-[0-9]{8}$');
alter table app_user
    add constraint chk_app_user_public_id_format
    check (public_id ~ '^USR-[0-9]{10}$');
alter table task_item
    add constraint chk_task_item_public_id_format
    check (public_id ~ '^TSK-[0-9]{12}$');
alter table subtask
    add constraint chk_subtask_public_id_format
    check (public_id ~ '^SUB-[0-9]{12}$');

-- Sequences for future inserts
create sequence if not exists organization_public_id_seq;
create sequence if not exists app_team_public_id_seq;
create sequence if not exists app_user_public_id_seq;
create sequence if not exists task_item_public_id_seq;
create sequence if not exists subtask_public_id_seq;

select setval('organization_public_id_seq', coalesce((select max(substring(public_id from 5)::bigint) from organization), 1), true);
select setval('app_team_public_id_seq', coalesce((select max(substring(public_id from 6)::bigint) from app_team), 1), true);
select setval('app_user_public_id_seq', coalesce((select max(substring(public_id from 5)::bigint) from app_user), 1), true);
select setval('task_item_public_id_seq', coalesce((select max(substring(public_id from 5)::bigint) from task_item), 1), true);
select setval('subtask_public_id_seq', coalesce((select max(substring(public_id from 5)::bigint) from subtask), 1), true);

create or replace function set_organization_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := 'ORG-' || lpad(nextval('organization_public_id_seq')::text, 8, '0');
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function set_app_team_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := 'TEAM-' || lpad(nextval('app_team_public_id_seq')::text, 8, '0');
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function set_app_user_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := 'USR-' || lpad(nextval('app_user_public_id_seq')::text, 10, '0');
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function set_task_item_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := 'TSK-' || lpad(nextval('task_item_public_id_seq')::text, 12, '0');
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function set_subtask_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := 'SUB-' || lpad(nextval('subtask_public_id_seq')::text, 12, '0');
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_organization_public_id on organization;
drop trigger if exists trg_set_app_team_public_id on app_team;
drop trigger if exists trg_set_app_user_public_id on app_user;
drop trigger if exists trg_set_task_item_public_id on task_item;
drop trigger if exists trg_set_subtask_public_id on subtask;

create trigger trg_set_organization_public_id
before insert on organization
for each row execute function set_organization_public_id();

create trigger trg_set_app_team_public_id
before insert on app_team
for each row execute function set_app_team_public_id();

create trigger trg_set_app_user_public_id
before insert on app_user
for each row execute function set_app_user_public_id();

create trigger trg_set_task_item_public_id
before insert on task_item
for each row execute function set_task_item_public_id();

create trigger trg_set_subtask_public_id
before insert on subtask
for each row execute function set_subtask_public_id();
