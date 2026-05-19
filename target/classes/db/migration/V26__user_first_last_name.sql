alter table app_user
    add column if not exists last_name varchar(80),
    add column if not exists first_name varchar(80);

update app_user
set last_name = coalesce(
        nullif(trim(split_part(trim(coalesce(full_name, '')), ' ', 1)), ''),
        trim(coalesce(full_name, ''))
    ),
    first_name = coalesce(nullif(trim(split_part(trim(coalesce(full_name, '')), ' ', 2)), ''), '')
where coalesce(last_name, '') = ''
   or coalesce(first_name, '') = '';

update app_user
set full_name = trim(concat_ws(' ',
    nullif(trim(last_name), ''),
    nullif(trim(first_name), ''),
    nullif(trim(patronymic), '')
))
where coalesce(full_name, '') = ''
   or full_name <> trim(concat_ws(' ',
        nullif(trim(last_name), ''),
        nullif(trim(first_name), ''),
        nullif(trim(patronymic), '')
    ));
