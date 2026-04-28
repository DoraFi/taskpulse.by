alter table board
    add column if not exists public_id varchar(36);

update board
set public_id = gen_random_uuid()::text
where public_id is null or public_id = '';

alter table board
    alter column public_id set not null;

create unique index if not exists ux_board_public_id on board(public_id);

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where table_name = 'board'
          and constraint_name = 'chk_board_public_id_uuid'
    ) then
        alter table board
            add constraint chk_board_public_id_uuid
            check (public_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
    end if;
end $$;

create or replace function set_board_public_id_uuid()
returns trigger as $$
begin
    if new.public_id is null or btrim(new.public_id) = '' then
        new.public_id := gen_random_uuid()::text;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_board_public_id on board;
create trigger trg_set_board_public_id
before insert on board
for each row execute function set_board_public_id_uuid();
