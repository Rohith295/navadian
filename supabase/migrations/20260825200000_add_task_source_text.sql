/*
  # Original Slack message text

  Stores the raw text of a Slack mention that created a Request, separate
  from title/description (which get AI-cleaned) — so the original ask stays
  visible for audit purposes without cluttering the main fields.
*/

ALTER TABLE tasks ADD COLUMN source_text text;
