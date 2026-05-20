-- Пересев FAQ (6+ вопросов в блоке) и документации (без dollar-quoting).

delete from help_faq;

insert into help_faq (category_id, position_no, question, answer) values
    ((select id from help_faq_category where slug = 'general'), 1, 'Как переключить тёмную тему?', 'Кнопка в правой части шапки. Выбор сохраняется в браузере.'),
    ((select id from help_faq_category where slug = 'general'), 2, 'Почему пустое боковое меню?', 'Чаще всего истекла сессия - войдите снова. Затем обновите страницу (Ctrl+F5).'),
    ((select id from help_faq_category where slug = 'general'), 3, 'Как создать задачу с любой страницы?', 'Кнопка «+» в шапке открывает окно создания задачи.'),
    ((select id from help_faq_category where slug = 'general'), 4, 'Где открыть профиль и настройки?', 'Иконки профиля и шестерёнки в шапке - модальные окна поверх текущей страницы.'),
    ((select id from help_faq_category where slug = 'general'), 5, 'Почему после ночи просит войти снова?', 'Истёк срок JWT-сессии. Войдите заново; с «Запомнить меня» срок дольше.'),
    ((select id from help_faq_category where slug = 'general'), 6, 'Как искать по справке?', 'На вкладках FAQ и «Документация» есть поле поиска - введите не менее 2 символов.'),

    ((select id from help_faq_category where slug = 'projects'), 1, 'Как создать проект?', '«Проекты» → «Создать проект»: название, тип (List, Kanban, Scrum), команда.'),
    ((select id from help_faq_category where slug = 'projects'), 2, 'Чем Kanban отличается от Scrum?', 'Kanban - непрерывный поток. Scrum - спринты, бэклог и отдельные колонки спринта.'),
    ((select id from help_faq_category where slug = 'projects'), 3, 'Где архивные проекты?', 'Меню «Проекты» → «Архивные проекты». Восстановление - на карточке архива.'),
    ((select id from help_faq_category where slug = 'projects'), 4, 'Почему не открывается доска?', 'Проверьте проект в адресе. Для архива нет кнопки «Открыть» - только восстановление.'),
    ((select id from help_faq_category where slug = 'projects'), 5, 'Что такое проекты организации?', 'Все проекты юрлица, а не только текущей команды - пункт в подменю «Проекты».'),
    ((select id from help_faq_category where slug = 'projects'), 6, 'Как сменить тип проекта?', 'Тип задаётся при создании; для другого типа создайте новый проект и перенесите задачи вручную.'),
    ((select id from help_faq_category where slug = 'projects'), 7, 'Сколько досок у проекта?', 'Зависит от типа: List - несколько табличных досок; Kanban/Scrum - основная доска и спринтовые зоны.'),

    ((select id from help_faq_category where slug = 'tasks'), 1, 'Почему задача пропала из «Готово»?', 'Завершённые задачи архивируются. Ищите в архиве доски или в отчётах.'),
    ((select id from help_faq_category where slug = 'tasks'), 2, 'Как назначить исполнителя?', 'На доске или в модальном окне задачи - поле «Исполнитель».'),
    ((select id from help_faq_category where slug = 'tasks'), 3, 'Как прикрепить файл?', 'В модальном окне задачи на Kanban/Scrum - блок вложений.'),
    ((select id from help_faq_category where slug = 'tasks'), 4, 'Где таблица всех задач команды?', 'Раздел «Задачи» в боковом меню - фильтры по проекту и статусу.'),
    ((select id from help_faq_category where slug = 'tasks'), 5, 'Как изменить приоритет?', 'В карточке или модальном окне задачи - поле приоритета.'),
    ((select id from help_faq_category where slug = 'tasks'), 6, 'Что такое подзадачи?', 'Чек-лист внутри задачи в модальном окне; отмечайте выполненные пункты.'),
    ((select id from help_faq_category where slug = 'tasks'), 7, 'Как перенести задачу между колонками?', 'Перетащите карточку на Kanban/Scrum или смените статус в модальном окне.'),

    ((select id from help_faq_category where slug = 'team'), 1, 'Как пригласить участника?', '«Команда» → «Добавить участника» → email и роль.'),
    ((select id from help_faq_category where slug = 'team'), 2, 'Как изменить роль?', 'Администратор открывает карточку участника и меняет роль.'),
    ((select id from help_faq_category where slug = 'team'), 3, 'Как написать участнику?', 'В карточке участника - отправка личного сообщения на email.'),
    ((select id from help_faq_category where slug = 'team'), 4, 'Как искать в команде?', 'Строка поиска над сеткой - имя, должность, отдел.'),
    ((select id from help_faq_category where slug = 'team'), 5, 'Кто может добавлять людей?', 'Администратор команды (роль team_admin).'),
    ((select id from help_faq_category where slug = 'team'), 6, 'Как покинуть команду?', 'Кнопка «Покинуть команду» в своей карточке участника.'),

    ((select id from help_faq_category where slug = 'analytics'), 1, 'Какой период влияет на графики?', 'Селектор «Период» в шапке аналитики (7–180 дней).'),
    ((select id from help_faq_category where slug = 'analytics'), 2, 'Почему нет архивного проекта?', 'Архивные проекты исключены из портфельной аналитики.'),
    ((select id from help_faq_category where slug = 'analytics'), 3, 'Где сравнение проектов?', 'Вкладка «Сравнение» в разделе «Аналитика».'),
    ((select id from help_faq_category where slug = 'analytics'), 4, 'Что такое CFD?', 'Диаграмма накопления - объём работ по стадиям во времени, вкладка «Обзор» или «Диаграммы».'),
    ((select id from help_faq_category where slug = 'analytics'), 5, 'Что показывает velocity?', 'Созданные и завершённые задачи по дням или неделям за период.'),
    ((select id from help_faq_category where slug = 'analytics'), 6, 'Как распечатать отчёт?', 'Кнопка «Печать отчёта» на странице аналитики.');

delete from help_doc_article;
delete from help_doc_section;

insert into help_doc_section (kind, slug, title, summary, position_no) values
    ('page', 'index', 'Сводка', 'Главная после входа', 1),
    ('page', 'tasks', 'Задачи', 'Таблица задач', 2),
    ('page', 'projects', 'Проекты', 'Список проектов', 3),
    ('page', 'projects-archive', 'Архив проектов', 'Архив', 4),
    ('page', 'team', 'Команда', 'Участники', 5),
    ('page', 'analytics', 'Аналитика', 'Метрики', 6),
    ('page', 'board-kanban', 'Kanban', 'Колонки статусов', 7),
    ('page', 'board-list', 'List', 'Таблица досок', 8),
    ('page', 'board-scrum', 'Scrum', 'Спринты', 9),
    ('modal', 'create-task', 'Создание задачи', 'Кнопка + в шапке', 1),
    ('modal', 'task-detail', 'Карточка задачи', 'Просмотр задачи', 2),
    ('modal', 'profile', 'Профиль', 'Личные данные', 3),
    ('modal', 'settings', 'Настройки', 'Параметры', 4);

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\nОткройте раздел «' || s.title || '» в боковом меню TaskPulse. Основные действия выполняются на этой странице; детали задач - в модальном окне по клику.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'index';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Таблица всех задач команды.\n- Фильтры по проекту и статусу.\n- Клик по строке открывает модальное окно задачи.\n- Создание - кнопка + в шапке.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'tasks';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Создать проект - кнопка на странице.\n- Типы: List, Kanban, Scrum.\n- Карточка ведёт на доску проекта.\n- Подменю: проекты организации и архив.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'projects';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Только восстановление проекта, без «Открыть».\n- Не учитываются в аналитике портфеля.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'projects-archive';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Сетка участников, поиск по имени и отделу.\n- Приглашение и смена ролей (админ).\n- Карточка участника - сообщение и редактирование.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'team';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Вкладки: Обзор, Отчёты, Диаграммы, Сравнение.\n- Период в шапке влияет на KPI и графики.\n- Архивные проекты не включены.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'analytics';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Колонки = статусы.\n- Drag-and-drop карточек.\n- «Готово» архивирует задачу.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-kanban';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Табличный вид досок List-проекта.\n- Переключение досок и отчёты.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-list';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Назначение: ' || s.summary || E'\n\n- Бэклог и активный спринт.\n- Планирование спринта.\n- Завершение спринта переносит остаток.',
       1 from help_doc_section s where s.kind = 'page' and s.slug = 'board-scrum';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Открытие: кнопка + в шапке (на любой странице).' || E'\n\n' || 'Поля: проект, доска, название, описание, исполнитель, приоритет, сроки. После сохранения задача на доске.',
       1 from help_doc_section s where s.kind = 'modal' and s.slug = 'create-task';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Открытие: клик по задаче на сводке, в «Задачах» или на доске.' || E'\n\n' || 'Редактирование статуса, исполнителя, описания, подзадач, вложений. Закрытие: крестик, фон или Escape.',
       1 from help_doc_section s where s.kind = 'modal' and s.slug = 'task-detail';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Открытие: иконка профиля в шапке.' || E'\n\n' || 'Имя, фамилия, отчество, дата рождения, аватар, смена пароля.',
       1 from help_doc_section s where s.kind = 'modal' and s.slug = 'profile';

insert into help_doc_article (section_id, slug, title, body_md, position_no)
select s.id, 'guide', s.title,
       'Открытие: иконка настроек в шапке.' || E'\n\n' || 'Параметры уведомлений и интерфейса в рамках реализованных опций.',
       1 from help_doc_section s where s.kind = 'modal' and s.slug = 'settings';
