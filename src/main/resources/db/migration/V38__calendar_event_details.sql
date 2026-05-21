alter table calendar_event
    add column if not exists location varchar(300),
    add column if not exists event_time varchar(16);
