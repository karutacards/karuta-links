CREATE TABLE album_snapshots (
  discord_id TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
