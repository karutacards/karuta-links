# Handoff: karuta-admin dump ingest

Read-only against `J:\karuta-admin` until a later pass. This file is the implementer spec for the Admin POST. Do not treat it as permission to edit that tree.

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

Until this patch ships, dumps are created with the curl fixture in the krtacc repo.

*Written by Cursor*
