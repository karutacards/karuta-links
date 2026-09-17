CREATE TABLE contest_dumps (
  contest_name TEXT NOT NULL,
  event_counter INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  PRIMARY KEY (contest_name, event_counter)
);
