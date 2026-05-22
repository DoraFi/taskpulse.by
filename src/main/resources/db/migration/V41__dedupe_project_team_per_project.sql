-- V40 linked the same project to every team the member belongs to in the org.
-- Keep one team per project: prefer the team with the most tasks on that project's boards.
WITH team_activity AS (
    SELECT
        pt.project_id,
        pt.team_id,
        COUNT(ti.id) AS task_cnt
    FROM project_team pt
    JOIN board b ON b.project_id = pt.project_id
    LEFT JOIN task_item ti ON ti.board_id = b.id
    GROUP BY pt.project_id, pt.team_id
),
ranked AS (
    SELECT
        project_id,
        team_id,
        ROW_NUMBER() OVER (
            PARTITION BY project_id
            ORDER BY task_cnt DESC, team_id ASC
        ) AS rn
    FROM team_activity
)
DELETE FROM project_team pt
USING ranked r
WHERE pt.project_id = r.project_id
  AND pt.team_id = r.team_id
  AND r.rn > 1;

-- Projects without boards/tasks: keep a single team link (stable lowest team_id).
DELETE FROM project_team pt_hi
WHERE EXISTS (
    SELECT 1
    FROM project_team pt_lo
    WHERE pt_lo.project_id = pt_hi.project_id
      AND pt_lo.team_id < pt_hi.team_id
);
