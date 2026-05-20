-- Новые доски при онбординге и в API без явного position_no получают порядок 1.
alter table board
    alter column position_no set default 1;
