CREATE TABLE draft_presence (
  draft_id INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (draft_id, discord_id)
);

CREATE INDEX idx_draft_presence_seen
  ON draft_presence (draft_id, last_seen);

CREATE INDEX idx_draft_audit_draft
  ON draft_audit (draft_id, id);
