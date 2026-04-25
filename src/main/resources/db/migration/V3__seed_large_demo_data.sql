insert into organization (id, name)
values
    ('AUR', 'Aurora Systems'),
    ('NEX', 'Nextline Digital'),
    ('VLT', 'Volt Forge'),
    ('ORB', 'Orbita Labs'),
    ('SKY', 'Skyframe Solutions'),
    ('TRI', 'Triada Group');

insert into app_user (email, full_name, password_hash, organization_id, username, is_active)
select
    lower(org.id) || '.user' || lpad(gs::text, 3, '0') || '@taskpulse.demo' as email,
    'Сотрудник ' || org.id || ' ' || lpad(gs::text, 3, '0') as full_name,
    '$2a$10$demo.hash.value.for.seed.only',
    org.id,
    lower(org.id) || '_u' || lpad(gs::text, 3, '0'),
    true
from organization org
cross join generate_series(1, 30) gs;

insert into app_team (organization_id, code, name, lead_user_id)
select
    org.id,
    (array['DEV', 'QAT', 'PRD', 'OPS'])[team_idx]::char(3) as code,
    case team_idx
        when 1 then 'Разработка'
        when 2 then 'Тестирование'
        when 3 then 'Продукт'
        else 'Инфраструктура'
    end || ' ' || org.id as name,
    (
        select u.id
        from app_user u
        where u.organization_id = org.id
        order by u.id
        offset (team_idx - 1) * 2
        limit 1
    ) as lead_user_id
from organization org
cross join generate_series(1, 4) team_idx;

insert into team_membership (team_id, user_id, role)
select
    t.id,
    u.id,
    case
        when u.id = t.lead_user_id then 'lead'
        when (u.id % 5) = 0 then 'viewer'
        else 'member'
    end as role
from app_team t
join app_user u on u.organization_id = t.organization_id
where
    (
        t.code = 'DEV' and (u.id % 4 in (0, 1))
    ) or (
        t.code = 'QAT' and (u.id % 4 in (2))
    ) or (
        t.code = 'PRD' and (u.id % 6 in (0, 3))
    ) or (
        t.code = 'OPS' and (u.id % 5 in (1, 4))
    );

insert into project (name, owner_id, organization_id, code, summary)
select
    'Проект ' || org.id || ' #' || lpad(p_idx::text, 2, '0') as name,
    (
        select u.id
        from app_user u
        where u.organization_id = org.id
        order by u.id
        offset (p_idx % 10)
        limit 1
    ) as owner_id,
    org.id,
    (chr(64 + p_idx) || chr(65 + (p_idx % 20)) || chr(66 + (p_idx % 18)))::char(3) as code,
    'Демо-проект организации ' || org.id || ' для наполнения стенда данными'
from organization org
cross join generate_series(1, 8) p_idx;

insert into project_team (project_id, team_id)
select p.id, t.id
from project p
join app_team t on t.organization_id = p.organization_id
where t.code in ('DEV', 'QAT', 'PRD');

insert into project_member (project_id, user_id, role)
select
    p.id,
    u.id,
    case
        when u.id = p.owner_id then 'owner'
        when (u.id % 9) = 0 then 'manager'
        when (u.id % 6) = 0 then 'observer'
        else 'contributor'
    end as role
from project p
join app_user u on u.organization_id = p.organization_id
where (u.id % 3) <> 1 or u.id = p.owner_id;

insert into board (name, project_id, code)
select 'Kanban', p.id, 'KANBAN'
from project p;

insert into board (name, project_id, code)
select 'List', p.id, 'LIST'
from project p;

insert into task_item (
    name,
    stage,
    priority,
    due_date,
    board_id,
    assignee_id,
    creator_id,
    task_code,
    description,
    story_points,
    estimate_hours,
    spent_hours
)
select
    'Задача ' || p.organization_id || ' ' || lpad(g.n::text, 4, '0') as name,
    (array['Очередь', 'В работе', 'Тестирование', 'Готово'])[((g.n % 4) + 1)],
    (array['обычный', 'срочно'])[((g.n % 2) + 1)],
    current_date + ((g.n % 45) - 10),
    b.id as board_id,
    (
        select u.id
        from app_user u
        where u.organization_id = p.organization_id
        order by u.id
        offset (g.n % 20)
        limit 1
    ) as assignee_id,
    p.owner_id as creator_id,
    p.organization_id || '-' || row_number() over(order by p.id, g.n) as task_code,
    'Подробное описание задачи для наполненной тестовой базы. Серия ' || g.n,
    (array[1,2,3,5,8,13])[(g.n % 6) + 1],
    ((g.n % 8) + 1)::numeric(8,2),
    ((g.n % 6))::numeric(8,2)
from project p
join board b on b.project_id = p.id and b.code = 'KANBAN'
cross join generate_series(1, 50) as g(n);

insert into subtask (name, completed, task_id)
select
    'Подзадача ' || s_idx || ' для ' || t.task_code,
    case when s_idx = 3 then false else (t.id % 2 = 0) end,
    t.id
from task_item t
cross join generate_series(1, 3) s_idx
where t.id % 2 = 0;

insert into task_dependency (task_id, depends_on_task_id)
select
    t.id,
    t.id - 1
from task_item t
where t.id % 5 = 0
  and exists (select 1 from task_item p where p.id = t.id - 1);

insert into task_label (organization_id, name, color)
select org.id, lbl.name, lbl.color
from organization org
cross join (
    values
        ('frontend', '#2E8B57'),
        ('backend', '#4169E1'),
        ('bug', '#D9534F'),
        ('urgent', '#FF8C00'),
        ('research', '#6A5ACD'),
        ('qa', '#20B2AA')
) as lbl(name, color);

insert into task_item_label (task_id, label_id)
select
    t.id,
    l.id
from task_item t
join project p on p.id = (select b.project_id from board b where b.id = t.board_id)
join task_label l on l.organization_id = p.organization_id
where (t.id + l.id) % 11 = 0;

insert into task_comment (task_id, author_id, body, created_at)
select
    t.id,
    t.creator_id,
    'Комментарий к задаче ' || t.task_code || ': уточнены требования и критерии приемки.',
    now() - ((t.id % 14) || ' days')::interval
from task_item t
where t.id % 3 = 0;

insert into task_comment (task_id, author_id, body, created_at)
select
    t.id,
    t.assignee_id,
    'Обновление статуса: выполнена часть работ, ожидается ревью.',
    now() - ((t.id % 7) || ' days')::interval
from task_item t
where t.id % 4 = 0 and t.assignee_id is not null;

insert into task_attachment (task_id, uploaded_by, file_name, file_url, created_at)
select
    t.id,
    coalesce(t.assignee_id, t.creator_id),
    'spec_' || t.task_code || '.pdf',
    '/uploads/' || lower(replace(t.task_code, '-', '_')) || '.pdf',
    now() - ((t.id % 10) || ' days')::interval
from task_item t
where t.id % 6 = 0;

insert into task_status_history (task_id, changed_by, old_stage, new_stage, changed_at)
select
    t.id,
    coalesce(t.assignee_id, t.creator_id),
    'Очередь',
    t.stage,
    now() - ((t.id % 12) || ' days')::interval
from task_item t
where t.stage <> 'Очередь';
