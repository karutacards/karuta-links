ALTER TABLE draft_audit ADD COLUMN save_id INTEGER;

UPDATE draft_audit
SET save_id = id
WHERE action IN ('add', 'update', 'delete', 'describe')
  AND save_id IS NULL;
