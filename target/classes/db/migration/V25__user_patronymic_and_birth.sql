alter table app_user
    add column if not exists patronymic varchar(80),
    add column if not exists birth_date date,
    add column if not exists birth_date_visibility varchar(20) not null default 'hidden';

alter table app_user drop constraint if exists chk_app_user_birth_visibility;
alter table app_user
    add constraint chk_app_user_birth_visibility
    check (birth_date_visibility in ('full', 'month_day', 'hidden'));
