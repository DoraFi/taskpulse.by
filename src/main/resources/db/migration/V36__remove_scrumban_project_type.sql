-- Перевод существующих проектов и удаление типа scrumban из справочника.
update project
set project_type = 'scrum'
where project_type = 'scrumban';

alter table project drop constraint if exists chk_project_type_format;

alter table project
    add constraint chk_project_type_format
    check (project_type in ('list', 'kanban', 'scrum'));

delete from project_type_lu where code = 'scrumban';
