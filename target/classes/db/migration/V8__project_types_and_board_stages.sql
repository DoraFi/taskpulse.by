alter table project
    add column if not exists project_type varchar(20);

update project
set project_type = case
    when code in ('RIZ', 'LST') then 'list'
    when code in ('PDZ', 'WCL') then 'kanban'
    when code = 'SMP' then 'scrum'
    when code = 'PUP' then 'scrumban'
    else coalesce(project_type, 'list')
end
where project_type is null;

alter table project
    alter column project_type set not null;

alter table project
    drop constraint if exists chk_project_type_format;

alter table project
    add constraint chk_project_type_format
    check (project_type in ('list', 'kanban', 'scrum', 'scrumban'));

create table if not exists board_stage (
    id bigserial primary key,
    board_id bigint not null references board(id) on delete cascade,
    stage_name varchar(60) not null,
    position int not null,
    constraint uk_board_stage_position unique (board_id, position),
    constraint uk_board_stage_name unique (board_id, stage_name)
);

create index if not exists ix_board_stage_board on board_stage(board_id);
