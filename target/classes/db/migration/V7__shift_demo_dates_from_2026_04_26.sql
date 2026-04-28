-- Shift demo dates so visible timelines start from 26.04.2026.
-- Applies a consistent day offset based on the earliest task due date.
with base as (
    select coalesce(min(due_date), date '2026-04-26') as min_due
    from task_item
    where due_date is not null
),
delta as (
    select (date '2026-04-26' - min_due) as d from base
)
update task_item t
set
    due_date = case when t.due_date is null then null else t.due_date + delta.d end,
    created_at = t.created_at + (delta.d * interval '1 day'),
    updated_at = t.updated_at + (delta.d * interval '1 day')
from delta;

with base as (
    select coalesce(min(changed_at::date), date '2026-04-26') as min_changed
    from task_status_history
),
delta as (
    select (date '2026-04-26' - min_changed) as d from base
)
update task_status_history h
set changed_at = h.changed_at + (delta.d * interval '1 day')
from delta;
