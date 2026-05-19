create table if not exists team_mail_message (
    id bigserial primary key,
    team_id bigint not null references app_team(id) on delete cascade,
    from_user_id bigint not null references app_user(id) on delete cascade,
    to_user_id bigint not null references app_user(id) on delete cascade,
    from_email varchar(160) not null,
    to_email varchar(160) not null,
    subject varchar(300) not null,
    body text not null,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

create index if not exists ix_team_mail_message_team on team_mail_message(team_id);
create index if not exists ix_team_mail_message_to_user on team_mail_message(to_user_id, created_at desc);
