-- Link projects to all teams of the same organization where the user is a project member.
-- Fixes empty task lists / search / create-task on a team when project_team was missing.
insert into project_team (project_id, team_id)
select distinct pm.project_id, tm.team_id
from project_member pm
join project p on p.id = pm.project_id
join team_membership tm on tm.user_id = pm.user_id
join app_team t on t.id = tm.team_id
where p.organization_id is not distinct from t.organization_id
  and not exists (
    select 1
    from project_team pt
    where pt.project_id = pm.project_id
      and pt.team_id = tm.team_id
  );
