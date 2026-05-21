alter table app_user
    add column if not exists last_login_at timestamptz,
    add column if not exists last_login_client varchar(200),
    add column if not exists previous_login_at timestamptz,
    add column if not exists previous_login_client varchar(200);
