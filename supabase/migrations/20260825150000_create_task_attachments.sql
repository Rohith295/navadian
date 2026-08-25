/*
  # Request attachments

  File uploads on a Request (task) — NDAs, contracts, redlines, signed copies.
  First use of Supabase Storage in this app, so this creates the bucket too.

  1. Storage
    - Private bucket `task-attachments` (never public — these are legal
      documents). Object path convention: "<task_id>/<uuid>-<filename>",
      which lets the storage RLS policies reuse the same team-access check
      as every other task-scoped table (task -> columns -> project).

  2. New Table
    - `task_attachments`: metadata row per uploaded file (name, size, mime
      type, uploader). Any team member can view/upload; only the uploader
      can delete, matching `task_comments`' delete policy (not the more
      permissive `task_checklist_items` one — a legal document shouldn't be
      removable by just any team member).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-attachments', 'task-attachments', false, 26214400) -- 25MB/file
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_attachments_team_select" ON task_attachments FOR SELECT TO authenticated
USING (task_id IN (
  SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
  WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
     OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
     OR user_has_direct_project_access(c.project_id, auth.uid())
));

CREATE POLICY "task_attachments_team_insert" ON task_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND task_id IN (
    SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
    WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
       OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
       OR user_has_direct_project_access(c.project_id, auth.uid())
  )
);

CREATE POLICY "task_attachments_owner_delete" ON task_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

-- storage.objects policies: bucket_id scoping plus the same team-access check,
-- keyed off the task_id embedded as the first path segment of the object name.
CREATE POLICY "task_attachments_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (split_part(name, '/', 1))::uuid IN (
    SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
    WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
       OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
       OR user_has_direct_project_access(c.project_id, auth.uid())
  )
);

CREATE POLICY "task_attachments_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND (split_part(name, '/', 1))::uuid IN (
    SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
    WHERE c.project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
       OR c.project_id IN (SELECT project_id FROM user_accessible_projects WHERE accessor_id = auth.uid())
       OR user_has_direct_project_access(c.project_id, auth.uid())
  )
);

CREATE POLICY "task_attachments_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND owner = auth.uid());
