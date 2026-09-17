CREATE TABLE sequences (
  section TEXT PRIMARY KEY,
  next_id INTEGER NOT NULL
);

CREATE TABLE documents (
  section TEXT NOT NULL,
  id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (section, id)
);

CREATE TABLE slugs (
  slug TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  id INTEGER NOT NULL,
  UNIQUE (section, id)
);

CREATE INDEX idx_documents_section_created
  ON documents (section, created_at DESC);
