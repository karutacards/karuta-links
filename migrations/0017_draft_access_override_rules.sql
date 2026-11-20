-- Draft access overrides now follow the global file's rules: whitelist entries are
-- Discord IDs of 17 to 20 digits and each credential bar is a whole number of at least 1.
-- Bring stored overrides in line without changing who can open a draft:
-- - A bar of 0 or less let every signed-in player in. Where the draft's access is
--   credentials (its own or the global file's, which is credentials), it becomes open.
-- - A fractional bar becomes the next whole number, which admits the same players.
-- - A whitelist entry that is not a Discord ID could never match an account, so it goes.
-- Anything still invalid after that is removed and falls back to the global value.

UPDATE drafts
SET access_config = json_set(access_config, '$.access', 'open')
WHERE access_config IS NOT NULL
  AND COALESCE(json_extract(access_config, '$.access'), 'credentials') = 'credentials'
  AND (
    (json_type(access_config, '$.credentials.minDrops') IN ('integer', 'real')
      AND json_extract(access_config, '$.credentials.minDrops') <= 0)
    OR (json_type(access_config, '$.credentials.minGrabs') IN ('integer', 'real')
      AND json_extract(access_config, '$.credentials.minGrabs') <= 0)
    OR (json_type(access_config, '$.credentials.minPurchases') IN ('integer', 'real')
      AND json_extract(access_config, '$.credentials.minPurchases') <= 0)
  );

UPDATE drafts
SET access_config = json_set(
  access_config,
  '$.credentials.minDrops',
  CAST(json_extract(access_config, '$.credentials.minDrops') AS INTEGER) + (json_extract(access_config, '$.credentials.minDrops') > CAST(json_extract(access_config, '$.credentials.minDrops') AS INTEGER))
)
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minDrops') = 'real'
  AND json_extract(access_config, '$.credentials.minDrops') > 0;

UPDATE drafts
SET access_config = json_set(
  access_config,
  '$.credentials.minGrabs',
  CAST(json_extract(access_config, '$.credentials.minGrabs') AS INTEGER) + (json_extract(access_config, '$.credentials.minGrabs') > CAST(json_extract(access_config, '$.credentials.minGrabs') AS INTEGER))
)
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minGrabs') = 'real'
  AND json_extract(access_config, '$.credentials.minGrabs') > 0;

UPDATE drafts
SET access_config = json_set(
  access_config,
  '$.credentials.minPurchases',
  CAST(json_extract(access_config, '$.credentials.minPurchases') AS INTEGER) + (json_extract(access_config, '$.credentials.minPurchases') > CAST(json_extract(access_config, '$.credentials.minPurchases') AS INTEGER))
)
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minPurchases') = 'real'
  AND json_extract(access_config, '$.credentials.minPurchases') > 0;

UPDATE drafts
SET access_config = json_set(access_config, '$.whitelist', json((
  SELECT json_group_array(value)
  FROM json_each(drafts.access_config, '$.whitelist')
  WHERE type = 'text'
    AND length(value) BETWEEN 17 AND 20
    AND value NOT GLOB '*[^0-9]*'
)))
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.whitelist') = 'array';

UPDATE drafts
SET access_config = json_remove(access_config, '$.whitelist')
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.whitelist') IS NOT NULL
  AND json_type(access_config, '$.whitelist') != 'array';

UPDATE drafts
SET access_config = json_remove(access_config, '$.credentials.minDrops')
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minDrops') IS NOT NULL
  AND NOT (
    json_type(access_config, '$.credentials.minDrops') = 'integer'
    AND json_extract(access_config, '$.credentials.minDrops') >= 1
  );

UPDATE drafts
SET access_config = json_remove(access_config, '$.credentials.minGrabs')
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minGrabs') IS NOT NULL
  AND NOT (
    json_type(access_config, '$.credentials.minGrabs') = 'integer'
    AND json_extract(access_config, '$.credentials.minGrabs') >= 1
  );

UPDATE drafts
SET access_config = json_remove(access_config, '$.credentials.minPurchases')
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials.minPurchases') IS NOT NULL
  AND NOT (
    json_type(access_config, '$.credentials.minPurchases') = 'integer'
    AND json_extract(access_config, '$.credentials.minPurchases') >= 1
  );

UPDATE drafts
SET access_config = json_remove(access_config, '$.credentials')
WHERE access_config IS NOT NULL
  AND json_type(access_config, '$.credentials') = 'object'
  AND (SELECT COUNT(*) FROM json_each(drafts.access_config, '$.credentials')) = 0;

UPDATE drafts
SET access_config = NULL
WHERE access_config IS NOT NULL
  AND (SELECT COUNT(*) FROM json_each(drafts.access_config)) = 0;
