create table if not exists seed_board_stage_template (
    id bigserial primary key,
    project_type varchar(20) not null,
    board_name varchar(120) not null,
    position_no int not null,
    stage_name varchar(60) not null,
    constraint uk_seed_board_stage_template unique (project_type, board_name, position_no),
    constraint uk_seed_board_stage_template_name unique (project_type, board_name, stage_name)
);

delete from seed_board_stage_template where project_type = 'kanban';
insert into seed_board_stage_template(project_type, board_name, position_no, stage_name) values
    ('kanban', 'Аналитика потока', 1, 'Очередь'),
    ('kanban', 'Аналитика потока', 2, 'В работе'),
    ('kanban', 'Аналитика потока', 3, 'Готово'),
    ('kanban', 'Разработка решений', 1, 'Очередь'),
    ('kanban', 'Разработка решений', 2, 'В работе'),
    ('kanban', 'Разработка решений', 3, 'Тестирование'),
    ('kanban', 'Разработка решений', 4, 'Готово'),
    ('kanban', 'Выпуск изменений', 1, 'Очередь'),
    ('kanban', 'Выпуск изменений', 2, 'В работе'),
    ('kanban', 'Выпуск изменений', 3, 'Тестирование'),
    ('kanban', 'Выпуск изменений', 4, 'Готово');

delete from seed_stage_template where stage_name = 'Новая';
