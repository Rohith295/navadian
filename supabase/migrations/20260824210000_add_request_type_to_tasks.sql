/*
  # Add request_type to tasks

  Product pivot: tasks are now referred to as "Requests" (NDA, Contract, MSA,
  Other) in the UI. This adds a structured type field so a request is a real
  CLM ticket rather than just relabeled text. Table/column name stays `tasks`.
*/

CREATE TYPE request_type AS ENUM ('NDA', 'Contract', 'MSA', 'Other');

ALTER TABLE tasks ADD COLUMN request_type request_type NOT NULL DEFAULT 'Other';
