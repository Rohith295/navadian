/*
  # Configurable Slack triggers

  Two independent, opt-in toggles per Slack connection: passive channel
  monitoring (create Requests from messages that don't mention the bot,
  gated by an AI intent check) and DM support. @mention always works
  regardless of these — that's the baseline, not a toggle.
*/

ALTER TABLE slack_workspaces ADD COLUMN passive_monitoring boolean NOT NULL DEFAULT false;
ALTER TABLE slack_workspaces ADD COLUMN dm_enabled boolean NOT NULL DEFAULT false;
