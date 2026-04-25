create extension if not exists pgcrypto;

alter table organization alter column public_id type varchar(36);
alter table app_team alter column public_id type varchar(36);
alter table app_user alter column public_id type varchar(36);

alter table organization drop constraint if exists chk_organization_public_id_format;
alter table app_team drop constraint if exists chk_app_team_public_id_format;
alter table app_user drop constraint if exists chk_app_user_public_id_format;
alter table task_item drop constraint if exists chk_task_item_public_id_format;
alter table subtask drop constraint if exists chk_subtask_public_id_format;

-- UUID for organizations, teams, users
update organization
set public_id = gen_random_uuid()::text
where public_id is null or public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update app_team
set public_id = gen_random_uuid()::text
where public_id is null or public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update app_user
set public_id = gen_random_uuid()::text
where public_id is null or public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

alter table organization
    add constraint chk_organization_public_id_format
    check (public_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table app_team
    add constraint chk_app_team_public_id_format
    check (public_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table app_user
    add constraint chk_app_user_public_id_format
    check (public_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

-- task public id = PROJECTKEY-N
update task_item t
set public_id = coalesce(task_code, 'TSK-' || t.id::text)
where t.public_id is null or t.public_id !~ '^[A-Z]{3}-[0-9]+$';

alter table task_item
    add constraint chk_task_item_public_id_format
    check (public_id ~ '^[A-Z]{3}-[0-9]+$');

-- subtask public id = PROJECTKEY-N-M
with ranked_subtasks as (
    select
        s.id as subtask_id,
        coalesce(t.task_code, 'TSK-' || t.id::text) || '-' ||
            row_number() over(partition by s.task_id order by s.id) as new_public_id
    from subtask s
    join task_item t on t.id = s.task_id
)
update subtask s
set public_id = r.new_public_id
from ranked_subtasks r
where s.id = r.subtask_id
  and (s.public_id is null or s.public_id !~ '^[A-Z]{3}-[0-9]+-[0-9]+$');

alter table subtask
    add constraint chk_subtask_public_id_format
    check (public_id ~ '^[A-Z]{3}-[0-9]+-[0-9]+$');

-- UUID generation triggers for org/team/user
create or replace function set_uuid_public_id() returns trigger as $$
begin
    if new.public_id is null then
        new.public_id := gen_random_uuid()::text;
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
for each row execute function set_uuid_public_id();

create trigger trg_set_app_team_public_id
before insert on app_team
for each row execute function set_uuid_public_id();

create trigger trg_set_app_user_public_id
before insert on app_user
for each row execute function set_uuid_public_id();

-- replace legacy V5 triggers for task/subtask public IDs
create or replace function set_task_item_public_id_from_task_code() returns trigger as $$
begin
    if new.public_id is null and new.task_code is not null then
        new.public_id := new.task_code;
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function set_subtask_public_id_from_task() returns trigger as $$
declare
    base_code varchar(24);
    next_ord bigint;
begin
    if new.public_id is null then
        select coalesce(t.task_code, 'TSK-' || t.id::text)
          into base_code
          from task_item t
         where t.id = new.task_id;

        select count(*) + 1
          into next_ord
          from subtask s
         where s.task_id = new.task_id;

        new.public_id := base_code || '-' || next_ord::text;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_set_task_item_public_id
before insert on task_item
for each row execute function set_task_item_public_id_from_task_code();

create trigger trg_set_subtask_public_id
before insert on subtask
for each row execute function set_subtask_public_id_from_task();
