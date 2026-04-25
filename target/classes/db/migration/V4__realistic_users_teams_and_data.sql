alter table app_user
    add column if not exists phone varchar(40),
    add column if not exists timezone varchar(60) default 'Europe/Minsk',
    add column if not exists office varchar(120),
    add column if not exists bio text,
    add column if not exists department varchar(120),
    add column if not exists position varchar(120),
    add column if not exists avatar_file varchar(120) default 'basic_avatar.png',
    add column if not exists team_joined_at date;

truncate table
    task_item_label,
    task_label,
    task_attachment,
    task_comment,
    task_status_history,
    task_dependency,
    subtask,
    task_item,
    board,
    project_member,
    project_team,
    project,
    team_membership,
    app_team,
    app_user,
    organization
restart identity cascade;

insert into organization (id, name)
values
    ('AUR', 'Aurora Product Studio'),
    ('NEX', 'Nextline Systems'),
    ('VLT', 'Volta Platform');

insert into app_user (
    email, full_name, password_hash, organization_id, username, is_active,
    phone, timezone, office, bio, department, position, avatar_file, team_joined_at
)
values
    ('daria.shved@aurora.by', 'Дарья Швед', '$2a$10$seed.demo.password', 'AUR', 'd.shved', true, '+375 (29) 123-45-67', 'Europe/Minsk', 'Минск, Немига 12', 'Backend developer, API and integrations.', 'Платформенная команда', 'Backend Developer', 'dar_shved.jpg', '2024-10-01'),
    ('lev.aksenov@aurora.by', 'Лев Аксенов', '$2a$10$seed.demo.password', 'AUR', 'l.aksenov', true, '+375 (29) 222-11-33', 'Europe/Minsk', 'Минск, Немига 12', 'Tech lead and architecture.', 'Платформенная команда', 'Tech Lead', 'lev_aksenov.jpg', '2024-08-15'),
    ('kseniya.glebko@aurora.by', 'Ксения Глебко', '$2a$10$seed.demo.password', 'AUR', 'k.glebko', true, '+375 (29) 333-44-55', 'Europe/Minsk', 'Минск, Немига 12', 'QA engineer.', 'QA', 'QA Engineer', 'ks_glebko.jpg', '2025-01-11'),
    ('polina.ilyuchik@aurora.by', 'Полина Ильючик', '$2a$10$seed.demo.password', 'AUR', 'p.ilyuchik', true, '+375 (29) 412-55-66', 'Europe/Minsk', 'Минск, Немига 12', 'UI/UX and design systems.', 'Дизайн', 'Product Designer', 'basic_avatar.png', '2025-02-01'),
    ('oksana.kvetko@aurora.by', 'Оксана Кветко', '$2a$10$seed.demo.password', 'AUR', 'o.kvetko', true, '+375 (29) 566-77-88', 'Europe/Minsk', 'Минск, Немига 12', 'Project delivery and planning.', 'Управление продуктом', 'Project Manager', 'basic_avatar.png', '2024-06-10'),
    ('ivan.petrov@nexline.by', 'Иван Петров', '$2a$10$seed.demo.password', 'NEX', 'i.petrov', true, '+375 (25) 111-11-11', 'Europe/Minsk', 'Минск, Победителей 8', 'Senior backend engineer.', 'Core Services', 'Senior Backend', 'basic_avatar.png', '2024-03-10'),
    ('anna.smirnova@nexline.by', 'Анна Смирнова', '$2a$10$seed.demo.password', 'NEX', 'a.smirnova', true, '+375 (25) 111-22-33', 'Europe/Minsk', 'Минск, Победителей 8', 'Frontend engineer.', 'Client Apps', 'Frontend Engineer', 'basic_avatar.png', '2024-03-10'),
    ('nikita.moroz@nexline.by', 'Никита Мороз', '$2a$10$seed.demo.password', 'NEX', 'n.moroz', true, '+375 (25) 222-33-44', 'Europe/Minsk', 'Минск, Победителей 8', 'DevOps and infra.', 'Infrastructure', 'DevOps Engineer', 'basic_avatar.png', '2024-05-15'),
    ('elena.ivanova@nexline.by', 'Елена Иванова', '$2a$10$seed.demo.password', 'NEX', 'e.ivanova', true, '+375 (25) 345-67-88', 'Europe/Minsk', 'Минск, Победителей 8', 'QA lead.', 'QA', 'QA Lead', 'basic_avatar.png', '2024-07-01'),
    ('alex.romanov@volta.by', 'Алекс Романов', '$2a$10$seed.demo.password', 'VLT', 'a.romanov', true, '+375 (33) 123-12-12', 'Europe/Minsk', 'Минск, Сурганова 4', 'Platform architect.', 'Core Platform', 'Architect', 'basic_avatar.png', '2023-12-10'),
    ('yulia.karpova@volta.by', 'Юлия Карпова', '$2a$10$seed.demo.password', 'VLT', 'y.karpova', true, '+375 (33) 220-33-44', 'Europe/Minsk', 'Минск, Сурганова 4', 'Business analyst.', 'Product', 'Business Analyst', 'basic_avatar.png', '2024-01-15'),
    ('sergey.kovalenko@volta.by', 'Сергей Коваленко', '$2a$10$seed.demo.password', 'VLT', 's.kovalenko', true, '+375 (33) 490-33-22', 'Europe/Minsk', 'Минск, Сурганова 4', 'Backend engineer.', 'Core Platform', 'Backend Engineer', 'basic_avatar.png', '2024-02-17');

insert into app_team (organization_id, code, name, lead_user_id)
values
    ('AUR', 'DEV', 'AUR Product Dev', (select id from app_user where username='l.aksenov')),
    ('AUR', 'QAT', 'AUR Quality Team', (select id from app_user where username='k.glebko')),
    ('AUR', 'PRD', 'AUR Product Office', (select id from app_user where username='o.kvetko')),
    ('NEX', 'DEV', 'NEX Backend Team', (select id from app_user where username='i.petrov')),
    ('NEX', 'OPS', 'NEX DevOps Team', (select id from app_user where username='n.moroz')),
    ('VLT', 'DEV', 'VLT Platform Team', (select id from app_user where username='a.romanov')),
    ('VLT', 'PRD', 'VLT Product Team', (select id from app_user where username='y.karpova'));

insert into team_membership (team_id, user_id, role)
select t.id, u.id,
       case when u.id = t.lead_user_id then 'lead' else 'member' end
from app_team t
join app_user u on u.organization_id = t.organization_id
where
    (t.code = 'DEV' and u.department in ('Платформенная команда', 'Core Services', 'Core Platform', 'Client Apps')) or
    (t.code = 'QAT' and u.department = 'QA') or
    (t.code = 'PRD' and u.department in ('Управление продуктом', 'Product', 'Дизайн')) or
    (t.code = 'OPS' and u.department = 'Infrastructure');

insert into project (name, owner_id, organization_id, code, summary)
values
    ('TaskPulse Core Platform', (select id from app_user where username='o.kvetko'), 'AUR', 'TPL', 'Платформа управления задачами, backend и интеграции'),
    ('TaskPulse Front Workspace', (select id from app_user where username='l.aksenov'), 'AUR', 'WRK', 'Интерфейсы Kanban, board-list, задачи и аналитика'),
    ('NEX ERP Integration', (select id from app_user where username='i.petrov'), 'NEX', 'ERP', 'Интеграции с ERP и обмен данными'),
    ('NEX Mobile Sync', (select id from app_user where username='a.smirnova'), 'NEX', 'MSY', 'Синхронизация мобильных клиентов'),
    ('VLT Billing Engine', (select id from app_user where username='a.romanov'), 'VLT', 'BIL', 'Расчет тарифов и биллинг'),
    ('VLT Analytics Hub', (select id from app_user where username='y.karpova'), 'VLT', 'ANL', 'Дашборды и продуктовая аналитика');

insert into project_member (project_id, user_id, role)
select p.id, u.id,
       case
           when u.id = p.owner_id then 'owner'
           when u.position ilike '%Lead%' or u.position ilike '%Manager%' then 'manager'
           when u.department in ('QA', 'Product', 'Управление продуктом') then 'observer'
           else 'contributor'
       end
from project p
join app_user u on u.organization_id = p.organization_id;

insert into board (name, project_id, code)
select 'Kanban', p.id, 'KANBAN' from project p;

insert into board (name, project_id, code)
select 'List', p.id, 'LIST' from project p;

insert into task_item (
    name, stage, priority, due_date, board_id, assignee_id, creator_id, task_code, description,
    story_points, estimate_hours, spent_hours, created_at, updated_at
)
select
    'Задача ' || p.code || ' #' || lpad(g.n::text, 3, '0'),
    (array['Очередь', 'В работе', 'Тестирование', 'Готово'])[(g.n % 4) + 1],
    (array['обычный', 'срочно'])[(g.n % 2) + 1],
    current_date + (g.n % 40) - 8,
    b.id,
    (
        select u.id
        from app_user u
        where u.organization_id = p.organization_id
        order by u.id
        offset (g.n % 4)
        limit 1
    ),
    p.owner_id,
    p.code || '-' || row_number() over(order by p.id, g.n),
    'Реализация бизнес-требования для проекта ' || p.code || ', итерация ' || g.n,
    (array[1,2,3,5,8,13])[(g.n % 6)+1],
    ((g.n % 9) + 2)::numeric(8,2),
    ((g.n % 6))::numeric(8,2),
    now() - ((60 - g.n) || ' days')::interval,
    now() - ((g.n % 14) || ' days')::interval
from project p
join board b on b.project_id = p.id and b.code = 'KANBAN'
cross join generate_series(1, 70) g(n);

insert into subtask (name, completed, task_id)
select 'Подзадача ' || s || ' для ' || t.task_code, (s < 3 and t.stage = 'Готово'), t.id
from task_item t
cross join generate_series(1, 3) s
where t.id % 2 = 0;

insert into task_dependency (task_id, depends_on_task_id)
select t.id, t.id - 1
from task_item t
where t.id % 6 = 0 and exists (select 1 from task_item x where x.id = t.id - 1);

insert into task_comment (task_id, author_id, body, created_at)
select
    t.id,
    coalesce(t.assignee_id, t.creator_id),
    'Обновление по задаче ' || t.task_code || ': статус уточнен, критерии приемки согласованы.',
    now() - ((t.id % 11) || ' days')::interval
from task_item t
where t.id % 3 = 0;

insert into task_attachment (task_id, uploaded_by, file_name, file_url, created_at)
select
    t.id,
    coalesce(t.assignee_id, t.creator_id),
    'spec_' || lower(replace(t.task_code, '-', '_')) || '.pdf',
    '/uploads/spec_' || lower(replace(t.task_code, '-', '_')) || '.pdf',
    now() - ((t.id % 9) || ' days')::interval
from task_item t
where t.id % 5 = 0;

insert into task_label (organization_id, name, color)
values
    ('AUR', 'backend', '#2E8B57'),
    ('AUR', 'frontend', '#4169E1'),
    ('AUR', 'urgent', '#FF8C00'),
    ('NEX', 'integration', '#6A5ACD'),
    ('NEX', 'devops', '#20B2AA'),
    ('VLT', 'analytics', '#8A2BE2'),
    ('VLT', 'billing', '#D9534F');

insert into task_item_label (task_id, label_id)
select t.id, l.id
from task_item t
join board b on b.id = t.board_id
join project p on p.id = b.project_id
join task_label l on l.organization_id = p.organization_id
where (t.id + l.id) % 13 = 0;

insert into task_status_history (task_id, changed_by, old_stage, new_stage, changed_at)
select
    t.id,
    coalesce(t.assignee_id, t.creator_id),
    'Очередь',
    t.stage,
    now() - ((t.id % 10) || ' days')::interval
from task_item t
where t.stage <> 'Очередь';
