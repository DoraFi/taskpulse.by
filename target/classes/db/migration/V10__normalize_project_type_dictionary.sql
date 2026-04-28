create table if not exists project_type_lu (
    code varchar(20) primary key,
    name varchar(80) not null,
    description text
);

insert into project_type_lu(code, name, description) values
    ('list', 'Список', 'Табличный учет задач и заявок'),
    ('kanban', 'Канбан', 'Непрерывный поток задач по этапам'),
    ('scrum', 'Скрам', 'Итерационная работа по спринтам'),
    ('scrumban', 'Скрамбан', 'Смешанный процесс поддержки и поставки')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'fk_project_project_type_lu'
          and table_name = 'project'
    ) then
        alter table project
            add constraint fk_project_project_type_lu
            foreign key (project_type) references project_type_lu(code);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'fk_seed_project_template_project_type_lu'
          and table_name = 'seed_project_template'
    ) then
        alter table seed_project_template
            add constraint fk_seed_project_template_project_type_lu
            foreign key (project_type) references project_type_lu(code);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'fk_seed_board_template_project_type_lu'
          and table_name = 'seed_board_template'
    ) then
        alter table seed_board_template
            add constraint fk_seed_board_template_project_type_lu
            foreign key (project_type) references project_type_lu(code);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'fk_seed_stage_template_project_type_lu'
          and table_name = 'seed_stage_template'
    ) then
        alter table seed_stage_template
            add constraint fk_seed_stage_template_project_type_lu
            foreign key (project_type) references project_type_lu(code);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'fk_seed_task_catalog_project_type_lu'
          and table_name = 'seed_task_catalog'
    ) then
        alter table seed_task_catalog
            add constraint fk_seed_task_catalog_project_type_lu
            foreign key (project_type) references project_type_lu(code);
    end if;
end $$;
