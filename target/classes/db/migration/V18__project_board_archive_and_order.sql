alter table project
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by bigint references app_user(id);

alter table board
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by bigint references app_user(id),
    add column if not exists position_no int;

update board b
set position_no = x.rn
from (
    select id, row_number() over (partition by project_id order by id) as rn
    from board
) x
where b.id = x.id
  and b.position_no is null;

alter table board
    alter column position_no set not null;

create index if not exists ix_project_archived_at on project(archived_at);
create index if not exists ix_board_project_archived on board(project_id, archived_at);
create index if not exists ix_board_project_position on board(project_id, position_no);
