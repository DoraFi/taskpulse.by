-- Общая дедупликация файлов (задачи + поддержка) и время хранения вложений поддержки.

create table if not exists stored_file (
    id bigserial primary key,
    sha256 char(64) not null,
    file_size bigint not null,
    content_type varchar(120),
    storage_path varchar(500) not null,
    created_at timestamptz not null default now(),
    constraint uk_stored_file_sha256 unique (sha256)
);

create index if not exists ix_stored_file_created_at on stored_file (created_at desc);

alter table task_attachment
    add column if not exists stored_file_id bigint references stored_file (id) on delete set null;

create index if not exists ix_task_attachment_stored_file on task_attachment (stored_file_id);

alter table help_support_attachment
    add column if not exists stored_file_id bigint references stored_file (id) on delete set null;

alter table help_support_attachment
    add column if not exists expires_at timestamptz;

create index if not exists ix_help_support_attachment_expires on help_support_attachment (expires_at);
create index if not exists ix_help_support_attachment_stored_file on help_support_attachment (stored_file_id);

