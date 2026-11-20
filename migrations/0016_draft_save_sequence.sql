-- 0007 gave older save events save_id = id, but the 'draft-saves' sequence started at 1,
-- so a new save could take an id already used on the same draft. Move the sequence past
-- every save id in use. allocateId hands out next_id after adding one.
INSERT INTO sequences (section, next_id)
SELECT 'draft-saves', COALESCE(MAX(save_id), 0) FROM draft_audit WHERE true
ON CONFLICT(section) DO UPDATE SET next_id = MAX(sequences.next_id, excluded.next_id);
