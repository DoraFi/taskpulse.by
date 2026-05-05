alter table board
    add column if not exists sprint_started_at timestamptz,
    add column if not exists sprint_finished_at timestamptz;

create index if not exists ix_board_sprint_started_at on board(sprint_started_at);
create index if not exists ix_board_sprint_finished_at on board(sprint_finished_at);
