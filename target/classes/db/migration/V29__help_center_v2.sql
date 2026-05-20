-- FAQ по блокам, заявки в поддержку с вложениями, документация по страницам и модалкам.

create table if not exists help_faq_category (
    id bigserial primary key,
    slug varchar(80) not null,
    title varchar(200) not null,
    position_no int not null default 0,
    is_published boolean not null default true,
    constraint uk_help_faq_category_slug unique (slug)
);

alter table help_faq
    add column if not exists category_id bigint references help_faq_category (id) on delete set null;

create index if not exists idx_help_faq_category on help_faq (category_id, position_no, id);

alter table help_doc_section
    add column if not exists kind varchar(16) not null default 'page';

alter table help_doc_section
    drop constraint if exists uk_help_doc_section_slug;

alter table help_doc_section
    add constraint uk_help_doc_section_kind_slug unique (kind, slug);

update help_support
set title = 'Заявка в поддержку',
    lead_text = 'Опишите проблему и приложите скриншоты или файлы. Мы ответим в рабочее время.',
    email = null,
    phone = null,
    telegram = null,
    work_hours = 'Пн–Пт, 09:00–18:00 (Минск)',
    response_hint = 'Статус заявки можно уточнить у администратора команды'
where id = 1;

create table if not exists help_support_ticket (
    id bigserial primary key,
    user_id bigint not null references app_user (id) on delete cascade,
    team_id bigint references app_team (id) on delete set null,
    subject varchar(200) not null,
    message text not null,
    status varchar(32) not null default 'new',
    created_at timestamptz not null default now()
);

create index if not exists idx_help_support_ticket_user on help_support_ticket (user_id, created_at desc);

create table if not exists help_support_attachment (
    id bigserial primary key,
    ticket_id bigint not null references help_support_ticket (id) on delete cascade,
    file_name varchar(255) not null,
    file_url varchar(500) not null,
    content_type varchar(120),
    file_size bigint,
    created_at timestamptz not null default now()
);

-- Категории FAQ
insert into help_faq_category (slug, title, position_no) values
    ('general', 'Общее', 1),
    ('projects', 'Проекты и доски', 2),
    ('tasks', 'Задачи', 3),
    ('team', 'Команда', 4),
    ('analytics', 'Аналитика', 5)
on conflict (slug) do nothing;

delete from help_faq;

insert into help_faq (category_id, position_no, question, answer) values
    ((select id from help_faq_category where slug = 'general'), 1,
     'Как переключить тёмную тему?',
     'Кнопка солнца/луны в правой части шапки. Выбор сохраняется в браузере.'),
    ((select id from help_faq_category where slug = 'general'), 2,
     'Почему пустое боковое меню?',
     'Чаще всего истекла сессия - войдите снова. Если ошибка повторяется, обновите страницу (Ctrl+F5).'),
    ((select id from help_faq_category where slug = 'general'), 3,
     'Как создать задачу из любого раздела?',
     'Кнопка «+» в шапке открывает модальное окно создания задачи.'),
    ((select id from help_faq_category where slug = 'projects'), 1,
     'Как создать проект?',
     'Раздел «Проекты» → «Создать проект»: название, тип (List, Kanban, Scrum) и команда.'),
    ((select id from help_faq_category where slug = 'projects'), 2,
     'Чем отличаются Kanban и Scrum?',
     'Kanban - непрерывный поток без спринтов. Scrum - спринты, бэклог и отдельные колонки спринта.'),
    ((select id from help_faq_category where slug = 'projects'), 3,
     'Где архивные проекты?',
     'Меню «Проекты» → «Архивные проекты». Восстановление - кнопка на карточке архива.'),
    ((select id from help_faq_category where slug = 'projects'), 4,
     'Почему не открывается доска проекта?',
     'Проверьте, что выбран верный проект в URL. Для архивного проекта доска доступна только по прямой ссылке.'),
    ((select id from help_faq_category where slug = 'tasks'), 1,
     'Почему задача в «Готово» пропала с доски?',
     'Завершённые задачи архивируются. Их можно открыть из архива доски или в отчётах.'),
    ((select id from help_faq_category where slug = 'tasks'), 2,
     'Как назначить исполнителя?',
     'В карточке задачи на доске или в модальном окне задачи выберите участника в поле «Исполнитель».'),
    ((select id from help_faq_category where slug = 'tasks'), 3,
     'Как прикрепить файл к задаче?',
     'В модальном окне задачи - блок вложений на Kanban/Scrum доске.'),
    ((select id from help_faq_category where slug = 'team'), 1,
     'Как пригласить участника?',
     'Раздел «Команда» → приглашение по email. После принятия пользователь появится в списке.'),
    ((select id from help_faq_category where slug = 'team'), 2,
     'Как изменить роль участника?',
     'Администратор команды открывает карточку участника и меняет роль или должность.'),
    ((select id from help_faq_category where slug = 'analytics'), 1,
     'Какой период влияет на графики?',
     'Селектор «Период» в шапке аналитики (7–180 дней) задаёт интервал для KPI и диаграмм на вкладке «Обзор».'),
    ((select id from help_faq_category where slug = 'analytics'), 2,
     'Почему в аналитике нет архивного проекта?',
     'Архивные проекты исключены из расчётов портфеля.');

-- Документация: страницы и модалки
delete from help_doc_article;
delete from help_doc_section;

insert into help_doc_section (kind, slug, title, summary, position_no) values
    ('page', 'index', 'Сводка (главная)', 'Лента задач и мини-графики', 1),
    ('page', 'tasks', 'Задачи', 'Таблица задач команды', 2),
    ('page', 'projects', 'Проекты', 'Список и создание проектов', 3),
    ('page', 'projects-archive', 'Архив проектов', 'Архивированные проекты команды', 4),
    ('page', 'team', 'Команда', 'Участники, роли, приглашения', 5),
    ('page', 'analytics', 'Аналитика', 'KPI, отчёты и диаграммы', 6),
    ('page', 'board-kanban', 'Доска Kanban', 'Колонки статусов и карточки', 7),
    ('page', 'board-list', 'Доска List', 'Табличный вид досок проекта', 8),
    ('page', 'board-scrum', 'Доска Scrum', 'Спринты, бэклог и колонки спринта', 9),
    ('modal', 'create-task', 'Создание задачи', 'Модальное окно по кнопке «+» в шапке', 1),
    ('modal', 'task-detail', 'Карточка задачи', 'Просмотр и редактирование задачи', 2),
    ('modal', 'profile', 'Профиль', 'Личные данные и аватар', 3),
    ('modal', 'settings', 'Настройки', 'Параметры аккаунта и интерфейса', 4);

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Сводка', $$
**Назначение:** стартовый экран после входа - обзор загрузки команды.

**Основное:**
- Блок «Мои задачи» - список назначенных вам задач.
- Мини-графики по активности (данные из истории статусов).
- Клик по задаче открывает **модальное окно задачи**.

**Совет:** после изменений на досках обновите сводку, перейдя на главную повторно или обновив страницу.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'index';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Задачи', $$
**Назначение:** единая таблица задач в контексте команды.

**Основное:**
- Фильтры по проекту, статусу и исполнителю.
- Открытие задачи - клик по строке → **модальное окно задачи**.
- Создание - кнопка «+» в шапке (**модальное окно создания**).
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'tasks';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Проекты', $$
**Назначение:** управление проектами команды.

**Основное:**
- «Создать проект» - мастер с типом List / Kanban / Scrum.
- Карточка проекта ведёт на доску (Kanban, List или Scrum).
- «Проекты организации» - все проекты org; «Архивные» - отдельный список.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'projects';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Архив проектов', $$
**Назначение:** просмотр снятых с активной работы проектов.

**Основное:**
- Карточки без перехода «Открыть» - только **Восстановить**.
- Метрики архива не попадают в аналитику портфеля.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'projects-archive';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Команда', $$
**Назначение:** состав команды и коммуникация.

**Основное:**
- Список участников с фильтрами по отделу и должности.
- Приглашение по email, смена роли (для админа).
- Личные сообщения участнику из карточки.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'team';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Аналитика', $$
**Назначение:** метрики команды за выбранный период.

**Вкладки:**
- **Обзор** - KPI, velocity, CFD.
- **Отчёты** - таблица по проектам.
- **Диаграммы** - статусы и приоритеты.
- **Сравнение** - проекты рядом.

Период в шапке (7–180 дней) влияет на расчёты.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'analytics';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Доска Kanban', $$
**Назначение:** канбан-доска проекта.

**Основное:**
- Колонки = статусы; перетаскивание карточек меняет статус.
- Фильтры исполнителя и приоритета.
- «Готово» архивирует задачу.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-kanban';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Доска List', $$
**Назначение:** табличное представление досок проекта типа List.

**Основное:**
- Переключение между досками проекта.
- Таймлайн и отчёты по проекту в боковых блоках.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-list';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Доска Scrum', $$
**Назначение:** спринты, бэклог и доска спринта.

**Основное:**
- Планирование спринта и перенос задач из бэклога.
- Колонки спринта отдельно от бэклога.
- Завершение спринта сдвигает незавершённые задачи.
$$, 1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-scrum';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Создание задачи', $$
**Открытие:** кнопка «+» в шапке на любой странице приложения.

**Поля:** проект, доска, название, описание, исполнитель, приоритет, сроки.

**После сохранения:** задача появляется на выбранной доске; можно сразу открыть карточку.
$$, 1 from help_doc_section s where s.kind = 'modal' and s.slug = 'create-task';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Карточка задачи', $$
**Открытие:** клик по задаче на сводке, в таблице «Задачи» или на доске.

**Возможности:** смена статуса, исполнителя, описания, подзадач, вложений (на досках).

**Закрытие:** крестик, клик по фону или Escape.
$$, 1 from help_doc_section s where s.kind = 'modal' and s.slug = 'task-detail';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Профиль', $$
**Открытие:** иконка профиля в шапке.

**Возможности:** имя, фамилия, отчество, дата рождения, аватар, смена пароля.
$$, 1 from help_doc_section s where s.kind = 'modal' and s.slug = 'profile';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', 'Настройки', $$
**Открытие:** иконка шестерёнки в шапке.

**Возможности:** уведомления, язык интерфейса, параметры отображения (в рамках реализованных опций).
$$, 1 from help_doc_section s where s.kind = 'modal' and s.slug = 'settings';
