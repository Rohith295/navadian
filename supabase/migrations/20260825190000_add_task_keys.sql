/*
  # Short, Jira-style Request keys (e.g. SCR-1012)

  Adds a denormalized, human-facing identifier alongside the uuid primary
  key on tasks — the uuid stays the real key everywhere internally, this
  is purely for links/display.
*/

ALTER TABLE projects ADD COLUMN key_prefix text;
ALTER TABLE projects ADD COLUMN next_task_number integer NOT NULL DEFAULT 1;

DO $$
DECLARE
  proj RECORD;
  candidate text;
  suffix int;
BEGIN
  FOR proj IN SELECT id, name FROM projects WHERE key_prefix IS NULL ORDER BY created_at LOOP
    candidate := upper(left(regexp_replace(proj.name, '[^a-zA-Z]', '', 'g'), 3));
    IF candidate = '' THEN candidate := 'REQ'; END IF;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM projects WHERE key_prefix = candidate) LOOP
      suffix := suffix + 1;
      candidate := upper(left(regexp_replace(proj.name, '[^a-zA-Z]', '', 'g'), 3)) || suffix;
    END LOOP;
    UPDATE projects SET key_prefix = candidate WHERE id = proj.id;
  END LOOP;
END $$;

ALTER TABLE projects ALTER COLUMN key_prefix SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_key_prefix_unique UNIQUE (key_prefix);

CREATE OR REPLACE FUNCTION assign_project_key_prefix()
RETURNS trigger AS $$
DECLARE
  candidate text;
  suffix int := 1;
BEGIN
  IF NEW.key_prefix IS NOT NULL THEN RETURN NEW; END IF;
  candidate := upper(left(regexp_replace(NEW.name, '[^a-zA-Z]', '', 'g'), 3));
  IF candidate = '' THEN candidate := 'REQ'; END IF;
  WHILE EXISTS (SELECT 1 FROM projects WHERE key_prefix = candidate) LOOP
    suffix := suffix + 1;
    candidate := upper(left(regexp_replace(NEW.name, '[^a-zA-Z]', '', 'g'), 3)) || suffix;
  END LOOP;
  NEW.key_prefix := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_key_prefix BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION assign_project_key_prefix();

ALTER TABLE tasks ADD COLUMN task_key text;

CREATE OR REPLACE FUNCTION assign_task_key()
RETURNS trigger AS $$
DECLARE
  proj_id uuid;
  prefix text;
  num int;
BEGIN
  SELECT c.project_id INTO proj_id FROM columns c WHERE c.id = NEW.column_id;

  UPDATE projects SET next_task_number = next_task_number + 1
  WHERE id = proj_id
  RETURNING key_prefix, next_task_number - 1 INTO prefix, num;

  NEW.task_key := prefix || '-' || num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_key BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION assign_task_key();

DO $$
DECLARE
  t RECORD;
  prefix text;
  num int;
BEGIN
  FOR t IN
    SELECT tasks.id, c.project_id
    FROM tasks JOIN columns c ON c.id = tasks.column_id
    WHERE tasks.task_key IS NULL
    ORDER BY tasks.created_at
  LOOP
    UPDATE projects SET next_task_number = next_task_number + 1
    WHERE id = t.project_id
    RETURNING key_prefix, next_task_number - 1 INTO prefix, num;
    UPDATE tasks SET task_key = prefix || '-' || num WHERE id = t.id;
  END LOOP;
END $$;

ALTER TABLE tasks ALTER COLUMN task_key SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_key_unique UNIQUE (task_key);
