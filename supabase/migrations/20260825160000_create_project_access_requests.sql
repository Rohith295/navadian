/*
  # Project access requests

  Lets someone who reaches a project link without access (e.g. via a Slack
  Request link) ask the owner/admin for it, instead of silently bouncing
  to the dashboard with no explanation.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('task_assigned', 'task_updated', 'project_invited', 'comment_added', 'access_requested'));

CREATE TABLE IF NOT EXISTS project_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- one live request per person per project
CREATE UNIQUE INDEX project_access_requests_one_pending ON project_access_requests(project_id, requested_by) WHERE status = 'pending';

ALTER TABLE project_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_select" ON project_access_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))
);

CREATE POLICY "access_requests_insert" ON project_access_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "access_requests_update" ON project_access_requests FOR UPDATE TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))
);
