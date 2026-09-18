# Handoff: karuta-admin dump ingest

Admin `actionqueue` `1120fcc` already POSTs this contract on hard production publish. Harvest fields: [karuta-admin-publish-data.md](karuta-admin-publish-data.md). Do not treat this file as permission to keep editing that tree.

## Trigger

Hard production publish only, in `Manager.publishData`, after S3 and Redis succeed and before the delayed Discord embed.

Skip the POST when the publish is soft (`!soft`) or silent (`skipWebhook`). Those already skip Discord. They must also skip krta.cc.

## Request

`POST https://krta.cc/api/v1/content`

Header: `Authorization: Bearer <INGEST_TOKEN>`

JSON body already accepted by [SPEC.md](../SPEC.md) and `src/ingest.ts`:

- `environment` (string, default `production`)
- `newSeries`, `updatedSeries`: `{ key, name }`
- `newCharacters`: `{ key, name, series, seriesName? }`
- `newEditions`, `updatedEditions`: `{ key, name, series, seriesName?, editions }`

`editions` is a non-empty array of edition numbers or `{ edition, version? }` objects. Send `version` when the edition is versioned so `ensureKeyedFull` hits `cards/versioned/…`.

`seriesName` may be omitted when the same payload includes that series key in `newSeries` or `updatedSeries`.

## Secret

Store `INGEST_TOKEN` in Doppler or Admin env under that name. Never commit the value. Never print it in chat or logs.

## Failure

Log the dump id and counts when the POST fails. Do not fail the Karuta publish. Do not retry in a tight loop.

## Out of scope for the first Admin patch

- Discord embed short URL
- `k!schedule`
- Soft or silent dumps
- Pointing the bot at keyed R2 objects

Admin `actionqueue` `1120fcc` POSTs this body after S3 and Redis on hard production publish. `seriesChanges` and `characterChanges` store `aliases.added` only. Groups and removed aliases are dropped. An alias-only publish is a valid dump.

The bearer must live in Admin env, not source. If the value appears in git or chat, rotate `INGEST_TOKEN` on the Worker and send the new value out of band.

*Written by Cursor*
