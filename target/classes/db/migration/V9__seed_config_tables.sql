create table if not exists seed_team_member (
    id bigserial primary key,
    position_no int not null,
    full_name varchar(120) not null,
    role_label varchar(120) not null,
    avatar_file varchar(120),
    is_lead boolean not null default false
);

create table if not exists seed_project_template (
    id bigserial primary key,
    code char(3) not null unique,
    project_type varchar(20) not null,
    name varchar(180) not null,
    summary text,
    board_count int not null default 3,
    tasks_per_stage int not null default 3
);

create table if not exists seed_board_template (
    id bigserial primary key,
    project_type varchar(20) not null,
    position_no int not null,
    board_name varchar(120) not null,
    constraint uk_seed_board_template unique (project_type, position_no)
);

create table if not exists seed_stage_template (
    id bigserial primary key,
    project_type varchar(20) not null,
    position_no int not null,
    stage_name varchar(60) not null,
    constraint uk_seed_stage_template unique (project_type, position_no),
    constraint uk_seed_stage_template_name unique (project_type, stage_name)
);

create table if not exists seed_task_catalog (
    id bigserial primary key,
    project_type varchar(20) not null,
    title varchar(220) not null
);

truncate table
    seed_team_member,
    seed_project_template,
    seed_board_template,
    seed_stage_template,
    seed_task_catalog
restart identity;

insert into seed_team_member(position_no, full_name, role_label, avatar_file, is_lead) values
    (1, 'Дарья Швед', 'Руководитель разработки', 'dar_shved.jpg', true),
    (2, 'Ксения Глебко', 'Тестировщик', 'ks_glebko.jpg', false),
    (3, 'Лев Аксенов', 'Разработчик', 'lev_aksenov.jpg', false),
    (4, 'Оксана Кветко', 'Руководитель проекта', 'basic_avatar.png', false),
    (5, 'Полина Ильючик', 'Дизайнер', 'pol_ilyuchik.jpg', false);

insert into seed_project_template(code, project_type, name, summary, board_count, tasks_per_stage) values
    ('RIZ', 'list', 'Реестр инцидентов и заявок', 'Табличный учет заявок, приоритетов, сроков и ответственных', 2, 3),
    ('PDZ', 'kanban', 'Поток разработки продуктовых задач', 'Непрерывный поток задач продуктовой разработки', 3, 3),
    ('SMP', 'scrum', 'Спринты мобильного приложения', 'Итерационная разработка мобильного приложения', 4, 2),
    ('PUP', 'scrumban', 'Поддержка и улучшения платформы', 'Комбинированный процесс поддержки и развития', 2, 3);

insert into seed_board_template(project_type, position_no, board_name) values
    ('list', 1, 'Бэклог'),
    ('list', 2, 'План'),
    ('list', 3, 'Контроль'),
    ('kanban', 1, 'Бэклог'),
    ('kanban', 2, 'Разработка'),
    ('kanban', 3, 'Проверка'),
    ('kanban', 4, 'Поддержка'),
    ('scrum', 1, 'Спринт'),
    ('scrum', 2, 'Разработка'),
    ('scrum', 3, 'Тест'),
    ('scrum', 4, 'Демо'),
    ('scrumban', 1, 'Очередь'),
    ('scrumban', 2, 'Поток'),
    ('scrumban', 3, 'Выпуск');

insert into seed_stage_template(project_type, position_no, stage_name) values
    ('list', 1, 'Новая'),
    ('list', 2, 'Очередь'),
    ('list', 3, 'В работе'),
    ('list', 4, 'Готово'),
    ('kanban', 1, 'Новая'),
    ('kanban', 2, 'Очередь'),
    ('kanban', 3, 'В работе'),
    ('kanban', 4, 'Тестирование'),
    ('kanban', 5, 'Готово'),
    ('scrum', 1, 'Новая'),
    ('scrum', 2, 'Очередь'),
    ('scrum', 3, 'В работе'),
    ('scrum', 4, 'Тестирование'),
    ('scrum', 5, 'Готово'),
    ('scrum', 6, 'Отложено'),
    ('scrumban', 1, 'Новая'),
    ('scrumban', 2, 'Очередь'),
    ('scrumban', 3, 'В работе'),
    ('scrumban', 4, 'Тестирование'),
    ('scrumban', 5, 'Готово');

insert into seed_task_catalog(project_type, title) values
    ('list', 'Разобрать входящие обращения'),
    ('list', 'Уточнить требования по заявке'),
    ('list', 'Подготовить оценку трудозатрат'),
    ('list', 'Согласовать SLA и приоритет'),
    ('list', 'Проверить корректность маршрутизации'),
    ('list', 'Обновить инструкцию обработки'),
    ('kanban', 'Подготовить контракт API'),
    ('kanban', 'Реализовать прикладную логику'),
    ('kanban', 'Покрыть тестами новый сценарий'),
    ('kanban', 'Провести код-ревью и правки'),
    ('kanban', 'Подготовить изменение схемы данных'),
    ('kanban', 'Проверить интеграцию в стенде'),
    ('scrum', 'Сформировать цель спринта'),
    ('scrum', 'Реализовать пользовательский сценарий'),
    ('scrum', 'Подготовить демонстрацию инкремента'),
    ('scrum', 'Согласовать задачи ретроспективы'),
    ('scrumban', 'Обработать входящий инцидент'),
    ('scrumban', 'Подготовить улучшение производительности'),
    ('scrumban', 'Проверить влияние на смежные сервисы'),
    ('scrumban', 'Обновить техническую документацию');
