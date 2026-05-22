-- Kanban/scrum projects linked to a team but without boards (sidebar showed PRO, kanban loaded another org's board by code).
insert into board (name, project_id, code, created_at, archived_at, archived_by, position_no)
select 'Название доски', p.id, 'KANBAN_1', now(), null, null, 1
from project p
join project_team pt on pt.project_id = p.id
where p.project_type in ('kanban', 'scrum')
  and not exists (select 1 from board b where b.project_id = p.id);

insert into board_stage (board_id, stage_name, position)
select b.id, s.stage_name, s.position
from board b
join project p on p.id = b.project_id
cross join (values ('Очередь', 1), ('В работе', 2), ('Готово', 3)) as s(stage_name, position)
where b.code = 'KANBAN_1'
  and p.project_type in ('kanban', 'scrum')
  and not exists (
      select 1 from board_stage bs where bs.board_id = b.id
  );
