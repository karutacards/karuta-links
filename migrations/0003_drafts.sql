CREATE TABLE drafts (
  id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  locked_at INTEGER,
  locked_by TEXT
);

CREATE TABLE draft_entities (
  draft_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  name TEXT NOT NULL,
  series_key TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL,
  last_editor_id TEXT,
  last_editor_name TEXT,
  PRIMARY KEY (draft_id, entity_type, entity_key)
);

CREATE TABLE draft_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_draft_entities_draft
  ON draft_entities (draft_id, entity_type, entity_key);

CREATE INDEX idx_draft_audit_entity
  ON draft_audit (draft_id, entity_type, entity_key, created_at DESC);
