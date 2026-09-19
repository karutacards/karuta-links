CREATE TABLE draft_reviews (
  draft_id INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (draft_id, discord_id)
);

CREATE INDEX idx_draft_reviews_draft
  ON draft_reviews (draft_id, updated_at);
