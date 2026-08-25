/*
  # AI suggestions + Slack thread sync

  1. task_ai_suggestions: one row per "Get AI Suggestion" click. Team-wide
     access (select/insert/update), same model as task_checklist_items — no
     per-row ownership, any team member can request/accept/dismiss.

  2. task_slack_threads: maps a Slack thread (channel + thread_ts) back to
     the Request it created, so later replies in that thread can be synced
     in as comments. Service-role only — no authenticated policies.
*/

CREATE TABLE IF NOT EXISTS task_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  request_type text,
  priority text,
  suggested_assignee uuid REFERENCES profiles(id),
  rationale text,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_ai_suggestions_team_select" ON task_ai_suggestions FOR SELECT TO authenticated
USING (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE POLICY "task_ai_suggestions_team_insert" ON task_ai_suggestions FOR INSERT TO authenticated
WITH CHECK (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE POLICY "task_ai_suggestions_team_update" ON task_ai_suggestions FOR UPDATE TO authenticated
USING (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
))
WITH CHECK (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE TABLE IF NOT EXISTS task_slack_threads (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  team_id text NOT NULL,
  channel text NOT NULL,
  thread_ts text NOT NULL,
  UNIQUE(channel, thread_ts)
);

ALTER TABLE task_slack_threads ENABLE ROW LEVEL SECURITY;
