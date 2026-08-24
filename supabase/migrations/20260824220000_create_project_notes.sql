/*
  # Create project_notes

  Freeform notes tied to a project (4th board tab, next to Board/Team/Activity).
*/

CREATE TABLE IF NOT EXISTS project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for accessible projects" ON project_notes FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
       OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create notes for accessible projects" ON project_notes FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
            OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own notes" ON project_notes FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notes" ON project_notes FOR DELETE TO authenticated USING (user_id = auth.uid());
