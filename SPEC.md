# krta.cc spec

This file is the source of truth for implemented behavior. If code and prose disagree, change the code or add a TODO here. Do not invent features that are missing from this spec.

## Purpose

krta.cc stores official Karuta dumps that do not present well in Discord. The first section is incrementally ID'd content dumps of published series, characters and editions, with card images.

## Names

| Surface | Name |
| --- | --- |
| Public domain | `krta.cc` |
| GitHub | `karutacards/karuta-links` |
| Cloudflare Worker and D1 | `karuta-links` |
| Local working tree | `krtacc` |

## Routing

| Path | Behavior |
| --- | --- |
| `/` | Recent content dumps, newest first |
| `/content/{id}` | Canonical dump. `{id}` is a positive integer with no leading zeros |
| `/{slug}` | 302 to `/{section}/{id}` when the slug exists |
| `/api/v1/content` | Authenticated ingest (`POST` only) |
| `/health` | Plain `ok` |
| `/robots.txt` | Allow all |

Reserved first segments: `api`, `assets`, `content`, `favicon.ico`, `health`, `robots.txt`, `static`. Those names never become slugs.

Slugs are exactly six characters in `[a-z0-9]`. They point only at internal `/{section}/{id}` paths. There are no open redirects.

IDs increment per section. `content/1` and a future `logs/1` are independent.

Unknown sections return 404.

## Content dumps

A dump is an immutable snapshot. Ingest builds unsigned HTTPS card URLs with the same path rules as Karuta's `Util.getCharacterImage`:

- Version `0` or omitted: `{cdn}/cards/{key}-{edition}.jpg`
- Version greater than `0`: `{cdn}/cards/versioned/{key}-{edition}-{version}.jpg`

The CDN base is `https://d2l56h9h5tj8ue.cloudfront.net/images`.

Public HTML shows names, series, editions and images. It does not scrape live production data.

## Ingest

`POST /api/v1/content` requires `Authorization: Bearer <INGEST_TOKEN>`.

The JSON body may include:

- `environment` (string, default `production`)
- `newSeries`, `updatedSeries`: `{ key, name }`
- `newCharacters`: `{ key, name, series, seriesName? }`
- `newEditions`, `updatedEditions`: `{ key, name, series, seriesName?, editions }`

`editions` is a non-empty array of edition numbers or `{ edition, version? }` objects. `seriesName` may be omitted when the same payload includes that series key in `newSeries` or `updatedSeries`.

The payload must contain at least one change. Maximum body size is 1,000,000 bytes.

A successful response is `201` with `section`, `id`, `slug`, `path`, `shortPath`, `url` and `shortUrl`. Absolute URLs use the request host.

There is no idempotency key.

## Visibility

Pages are public. Writes require the ingest token. Soft and silent Karuta publishes are out of scope until Admin is wired.

## Non-goals

- Karuta Admin or Discord webhook integration
- `k!schedule` changes
- Custom domain attachment
- Historical backfill
- Accounts
- R2 image mirrors
