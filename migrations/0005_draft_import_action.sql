ALTER TABLE draft_entities
  ADD COLUMN import_action TEXT NOT NULL DEFAULT 'add';

ALTER TABLE draft_entities
  ADD COLUMN base_aliases TEXT NOT NULL DEFAULT '[]';
