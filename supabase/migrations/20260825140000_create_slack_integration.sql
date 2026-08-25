/*
  # Slack Integration

  1. New Tables
    - `slack_workspaces`: one row per Slack workspace install, mapped to a single
      target project ("one fixed project for the org"). Holds the bot token used
      to post replies back into Slack.
    - `slack_processed_events`: idempotency guard for the events webhook so a
      Slack retry never creates a duplicate Request.

  2. Security
    - RLS enabled on both. `slack_workspaces` is readable/deletable only by the
      project's owner or an admin/owner `project_members` row. No authenticated
      INSERT/UPDATE policy — only the service-role OAuth callback route writes
      rows, mirroring how `stripe_customers`/`stripe_subscriptions` are written
      exclusively by the Stripe webhook route.
    - `slack_processed_events` has no authenticated policies at all — it's only
      ever touched by the service-role webhook route.
*/

CREATE TABLE IF NOT EXISTS slack_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text NOT NULL UNIQUE,
  team_name text,
  bot_access_token text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  installed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE slack_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_workspaces_admin_select" ON slack_workspaces FOR SELECT TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE POLICY "slack_workspaces_admin_delete" ON slack_workspaces FOR DELETE TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE TABLE IF NOT EXISTS slack_processed_events (
  slack_event_id text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE slack_processed_events ENABLE ROW LEVEL SECURITY;
