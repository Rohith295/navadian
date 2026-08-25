/*
  # Create task_checklist_items

  Sub-item checklist inside each Request (task), e.g. "Legal review",
  "Signature obtained", "Filed". No per-item ownership — any project member
  can add/check/delete items, same team-access model as the task itself.
*/

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_checklist_items_team_select" ON task_checklist_items FOR SELECT TO authenticated
USING (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE POLICY "task_checklist_items_team_insert" ON task_checklist_items FOR INSERT TO authenticated
WITH CHECK (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE POLICY "task_checklist_items_team_update" ON task_checklist_items FOR UPDATE TO authenticated
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

CREATE POLICY "task_checklist_items_team_delete" ON task_checklist_items FOR DELETE TO authenticated
USING (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));
