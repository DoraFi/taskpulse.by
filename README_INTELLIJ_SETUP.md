# TaskPulse: запуск в IntelliJ IDEA

## 1) Открытие проекта

1. Откройте папку проекта в IntelliJ IDEA как Maven-проект.
2. Убедитесь, что выбрана JDK 17+ (`File -> Project Structure -> SDK`).

## 2) База данных PostgreSQL

### Вариант A (рекомендуется): через Docker

В корне проекта уже добавлен `docker-compose.yml`.

Запуск:

```bash
docker compose up -d
```

Проверка:

```bash
docker ps
```

### Вариант B: локальный PostgreSQL

Если PostgreSQL установлен локально, создайте БД:

```sql
create database taskpulse;
```

## 3) Параметры подключения

Параметры берутся из `src/main/resources/application.yml` и могут переопределяться через переменные окружения:

- `DB_HOST` (по умолчанию `localhost`)
- `DB_PORT` (по умолчанию `5432`)
- `DB_NAME` (по умолчанию `taskpulse`)
- `DB_USER` (по умолчанию `postgres`)
- `DB_PASSWORD` (по умолчанию `655650`)

Если используете `docker-compose.yml` из проекта, менять ничего не нужно.

## 4) Первый запуск

1. Запустите класс `by.taskpulse.TaskpulseApplication`.
2. Flyway автоматически создаст схему БД из `db/migration/V1__init.sql`.

## 5) Что уже работает

- Server-side страницы через Thymeleaf: контроллер `PageController`.
- Текущая фронтенд-структура сохранена:
  - шаблоны читаются из `./templates`
  - статика отдается из `./static`
- Базовый backend-каркас:
  - JPA-сущности: `User`, `Project`, `Board`, `TaskItem`, `Subtask`, `TaskDependency`
  - репозитории Spring Data
  - API:
    - `GET /api/boards`
    - `GET /api/boards/{boardId}/tasks`

## 6) Если снова ошибка "database taskpulse does not exist"

1. Убедитесь, что контейнер БД запущен (`docker ps`).
2. Проверьте, что в `application.yml` и/или env совпадают хост/порт/имя БД.
3. Для локального PostgreSQL выполните:

```sql
create database taskpulse;
```

## 7) Рекомендованный следующий шаг

1. Добавить сервисы и DTO вместо отдачи JPA-сущностей напрямую.
2. Перевести страницы на полноценный Thymeleaf (`th:*`) и убрать хардкод данных.
3. Подключить Spring Security и реальную регистрацию/логин.
4. Перенести текущие JSON-данные в БД (миграция + сидирование).
