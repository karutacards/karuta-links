CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  reporter_id TEXT NOT NULL,
  reporter_username TEXT NOT NULL,
  reason TEXT NOT NULL,
  user_ids TEXT NOT NULL,
  server_ids TEXT NOT NULL,
  channel_ids TEXT NOT NULL,
  card_codes TEXT NOT NULL,
  dye_codes TEXT NOT NULL,
  idol_codes TEXT NOT NULL,
  notes TEXT NOT NULL,
  acknowledged INTEGER NOT NULL
);

CREATE INDEX idx_reports_created ON reports (created_at DESC);
CREATE INDEX idx_reports_reporter ON reports (reporter_id, created_at DESC);

CREATE TABLE report_bans (
  discord_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  reason TEXT
);
