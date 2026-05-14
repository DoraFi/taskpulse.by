-- Этапы досок Kanban/Scrum: заполнить board_stage там, где ещё нет строк (старые данные / доски без сидов).

insert into board_stage (board_id, stage_name, position)
select b.id, t.stage_name, t.position_no
from board b
join project p on p.id = b.project_id
join seed_board_stage_template t
    on t.project_type = p.project_type
    and t.board_name = b.name
where not exists (select 1 from board_stage s where s.board_id = b.id)
  and p.project_type = 'kanban';

insert into board_stage (board_id, stage_name, position)
select b.id, st.stage_name, st.position_no
from board b
join project p on p.id = b.project_id
join seed_stage_template st on st.project_type = p.project_type
where not exists (select 1 from board_stage s where s.board_id = b.id)
  and p.project_type in ('kanban', 'scrum', 'scrumban');
