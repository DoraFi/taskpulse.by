-- Справочный раздел: FAQ, контакты поддержки, документация.
-- Контент редактируется в БД; на фронте позже: /help, /help/faq, /help/docs/{slug}.

create table help_faq (
    id bigserial primary key,
    position_no int not null default 0,
    question varchar(500) not null,
    answer text not null,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_help_faq_published_order on help_faq (is_published, position_no, id);

-- Одна карточка настроек поддержки (id = 1).
create table help_support (
    id smallint primary key default 1 check (id = 1),
    title varchar(200) not null default 'Контактная поддержка',
    lead_text text,
    email varchar(120),
    phone varchar(60),
    telegram varchar(120),
    work_hours varchar(200),
    response_hint varchar(200),
    is_active boolean not null default true,
    updated_at timestamptz not null default now()
);

create table help_doc_section (
    id bigserial primary key,
    parent_id bigint references help_doc_section (id) on delete set null,
    position_no int not null default 0,
    slug varchar(80) not null,
    title varchar(200) not null,
    summary varchar(500),
    is_published boolean not null default true,
    constraint uk_help_doc_section_slug unique (slug)
);

create index idx_help_doc_section_tree on help_doc_section (parent_id, position_no);

create table help_doc_article (
    id bigserial primary key,
    section_id bigint not null references help_doc_section (id) on delete cascade,
    position_no int not null default 0,
    slug varchar(80) not null,
    title varchar(200) not null,
    body_md text not null,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uk_help_doc_article_section_slug unique (section_id, slug)
);

create index idx_help_doc_article_published on help_doc_article (section_id, is_published, position_no);

insert into help_support (id, title, lead_text, email, work_hours, response_hint)
values (
    1,
    'Контактная поддержка',
    'Напишите в поддержку, если не получается войти, создать проект или перенести задачу между досками.',
    'support@taskpulse.by',
    'Пн–Пт, 09:00–18:00 (Минск)',
    'Обычно отвечаем в течение одного рабочего дня'
);

insert into help_faq (position_no, question, answer) values
    (1, 'Как создать проект?', 'Откройте раздел «Проекты» → «Создать проект», укажите название, тип (Kanban, Scrum или List) и команду.'),
    (2, 'Почему задача в «Готово» пропала с доски?', 'Завершённые задачи автоматически архивируются. Их можно найти в архиве задач доски или в отчётах.'),
    (3, 'Как пригласить участника в команду?', 'Раздел «Команда» → приглашение по email. После принятия приглашения пользователь появится в списке.'),
    (4, 'Чем отличаются Kanban и Scrum?', 'Kanban - непрерывный поток без спринтов. Scrum - планирование спринта, бэклог и отдельные колонки спринта.'),
    (5, 'Где смотреть аналитику?', 'Раздел «Аналитика»: KPI, velocity, CFD и сравнение проектов за выбранный период.');

insert into help_doc_section (position_no, slug, title, summary) values
    (1, 'start', 'Начало работы', 'Первые шаги в TaskPulse'),
    (2, 'projects', 'Проекты и доски', 'Типы проектов и рабочие пространства'),
    (3, 'tasks', 'Задачи', 'Создание, статусы и назначение'),
    (4, 'analytics', 'Аналитика', 'Метрики команды и отчёты');

insert into help_doc_article (section_id, position_no, slug, title, body_md)
select s.id, 1, 'quick-start', 'Быстрый старт',
       '1. Войдите в аккаунт.\n2. Создайте проект и выберите тип.\n3. Добавьте доску или используйте стандартную.\n4. Создайте задачу и назначьте исполнителя.'
from help_doc_section s where s.slug = 'start';

insert into help_doc_article (section_id, position_no, slug, title, body_md)
select s.id, 1, 'project-types', 'Типы проектов',
       '- **List** - табличный список досок.\n- **Kanban** - колонки по статусам.\n- **Scrum** - спринты и бэклог.'
from help_doc_section s where s.slug = 'projects';

insert into help_doc_article (section_id, position_no, slug, title, body_md)
select s.id, 1, 'task-lifecycle', 'Жизненный цикл задачи',
       'Задача проходит статусы доски. Перевод в «Готово» завершает работу и архивирует карточку.'
from help_doc_section s where s.slug = 'tasks';

insert into help_doc_article (section_id, position_no, slug, title, body_md)
select s.id, 1, 'dashboard-overview', 'Обзор аналитики',
       'На вкладке «Обзор» - KPI, velocity и CFD. Период (7–180 дней) влияет на все графики верхнего блока.'
from help_doc_section s where s.slug = 'analytics';
