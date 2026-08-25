/*
  # Email intake

  Mirrors the Slack integration: forward/CC a shared address, and it creates
  a Request the same way a Slack mention does.
*/

CREATE TABLE IF NOT EXISTS email_intake_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inbound_address text NOT NULL,
  installed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_intake_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_intake_admin_select" ON email_intake_settings FOR SELECT TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE POLICY "email_intake_admin_delete" ON email_intake_settings FOR DELETE TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE TABLE IF NOT EXISTS email_processed_messages (
  message_id text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS task_email_threads (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  message_id text NOT NULL UNIQUE
);

ALTER TABLE task_email_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE tasks ADD COLUMN source_channel text CHECK (source_channel IN ('slack', 'email'));
