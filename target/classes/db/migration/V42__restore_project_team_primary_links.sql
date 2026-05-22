-- Restore project_team for the team that owns/administers the project (after V41 over-pruning).
INSERT INTO project_team (project_id, team_id)
SELECT DISTINCT aur.project_id, aur.team_id
FROM app_user_role aur
WHERE aur.project_id IS NOT NULL
  AND aur.team_id IS NOT NULL
  AND aur.role_code = 'project_admin'
ON CONFLICT DO NOTHING;

INSERT INTO project_team (project_id, team_id)
SELECT DISTINCT p.id, tm.team_id
FROM project p
JOIN project_member pm ON pm.project_id = p.id AND pm.role = 'owner'
JOIN team_membership tm ON tm.user_id = pm.user_id
JOIN app_team t ON t.id = tm.team_id
WHERE p.organization_id IS NOT DISTINCT FROM t.organization_id
  AND NOT EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id)
ON CONFLICT DO NOTHING;
