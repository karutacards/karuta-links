# krta.cc spec

This file is the source of truth for implemented behavior. If code and prose disagree, change the code or add a TODO here. Do not invent features that are missing from this spec.

## Purpose

krta.cc stores Karuta dumps that do not present well in Discord. Sections are incrementally ID'd content updates and Card Hunt contest results.

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
| `/` | Karuta dumps: content updates and contest results, newest first |
| `/content/{id}` | Canonical content dump. `{id}` is a positive integer with no leading zeros |
| `/contests` | Contest results (Card Hunt), newest first |
| `/contests/{id}` | Canonical contest dump. `{id}` is a positive integer with no leading zeros |
| `/{slug}` | 302 to `/{section}/{id}` when the slug exists |
| `/api/v1/content` | Authenticated ingest (`POST` only) |
| `/api/auth/discord` | Start Discord identify. No login control on public HTML |
| `/api/auth/callback` | Exchange the authorization code and set a session cookie |
| `/api/auth/me` | Session probe. `{ authenticated: false }` or `{ authenticated: true, discordId, username }` |
| `/api/auth/logout` | Clear the session cookie (`POST` only) |
| `/images/…` | Image from `karuta-images`. Character-art keys fall back to CloudFront on a miss. Contest keys do not |
| `/health` | Plain `ok` |
| `/robots.txt` | Allow all |

Reserved first segments: `api`, `assets`, `content`, `contests`, `favicon.ico`, `health`, `images`, `robots.txt`, `static`. Those names never become slugs.

Slugs are exactly six characters in `[a-z0-9]`. They point only at internal `/{section}/{id}` paths. There are no open redirects.

IDs increment per section. `content/1` and `contests/1` are independent.

Unknown sections return 404.

## Content dumps

A dump is an immutable snapshot. Ingest stores same-origin image URLs. Those paths name character images (unframed edition art), not framed cards:

- Version `0` or omitted: `/images/characters/{key}-{edition}.jpg`
- Version greater than `0`: `/images/characters/versioned/{key}-{edition}-{version}.jpg`

Those are unframed character edition images. Framed Card Hunt tiles use `/images/contests/…`. A request to `/images/cards/…` 301s to the matching `/images/characters/…` path.

Keys are URI-encoded the same way karuta.today encodes CloudFront paths. The Worker serves `/images/…` from private R2 `karuta-images`. Character-art objects stay at Karuta's `cards/…` keys in R2 and on the uncached host `d29rfjkp84y49u.cloudfront.net`. A miss fetches that origin and stores the full JPEG. The Worker does not build thumbs.

Public HTML shows names, series, new aliases, editions and images. It does not show groups. It does not scrape live production data. The page description is the same count line as the home listing. The published time and short URL sit on separate lines. Short URLs display as `krta.cc/{slug}`.

## Contest dumps

A Card Hunt dump is an immutable snapshot of one finished event. The Worker polls Firestore every minute. There is no bot POST.

1. Read `contests/card_hunt`.
2. If `eventCounter` is not greater than the last dumped event, stop.
3. Read `contests/card_hunt/events/{eventCounter}`.
4. If `rewarded` is not true, stop. Keep the last-dumped number unchanged.
5. List `contests/card_hunt/events/{eventCounter}/contest_entries/{card_id}`.
6. Copy framed-card images from the saved URLs into `karuta-images` at `contests/card/{eventCounter}/{place}`. The reference card is `contests/card/{eventCounter}/ref`. Contest images are immutable snapshots. Responses send a one-year `Cache-Control` and `CDN-Cache-Control` and are stored in the Workers Cache API.
7. Store the snapshot and a slug. Canonical path is `/contests/{id}`.

Do not dump older events than the first `eventCounter` seen after deploy. Do not call Gemini. Do not re-render cards. Do not use character-art `/images/characters/{key}-{edition}.jpg` for contest tiles.

Public HTML shows the description, winners, reference card and ranked entries with framed-card images. Submitter Discord ids are on the entries. Entries are ranked by highest score, then earliest submission. The page description is the winner count, entry count, entry fee and prize pool. The published time and short URL sit on separate lines. Short URLs display as `krta.cc/{slug}`.

## Ingest

`POST /api/v1/content` requires `Authorization: Bearer <INGEST_TOKEN>`.

The JSON body may include:

- `environment` (string, default `production`)
- `newSeries`, `updatedSeries`: `{ key, name }`
- `newCharacters`: `{ key, name, series, seriesName? }`
- `newEditions`, `updatedEditions`: `{ key, name, series, seriesName?, editions }`
- `seriesChanges`, `characterChanges`: Admin metadata diffs. Only `aliases.added` is stored. `groups` and `aliases.removed` are ignored.

`editions` is a non-empty array of edition numbers or `{ edition, version? }` objects. `seriesName` may be omitted when the same payload includes that series key in `newSeries` or `updatedSeries`.

The payload must contain at least one series, character, edition or added-alias change. Maximum body size is 1,000,000 bytes.

Public HTML lists new series, updated series names, new characters, new aliases and edition galleries. It does not show groups. `updatedSeries` is the current name only. Admin does not send the previous name or a character-rename list.

A successful response is `201` with `section`, `id`, `slug`, `path`, `shortPath`, `url` and `shortUrl`. Absolute URLs use the request host.

There is no idempotency key.

Contest dumps are not ingested over HTTP.

## Visibility

Pages are public. Content-dump writes require the ingest token. A hard production publish from karuta-admin POSTs a dump. Soft and silent publishes skip that POST.

Discord OAuth can issue a signed session cookie (`identify` only). It does not gate dumps, ingest or any public HTML. There is no Sign in control. The registered redirects are only `https://krta.cc/api/auth/callback` and `http://127.0.0.1:8787/api/auth/callback`. Local wrangler presents `http://krta.cc` and maps that to the 127.0.0.1 callback. Missing Discord secrets return `503` on the start and callback routes. Ingest and dump pages keep working.

The Worker is attached at `krta.cc`. `workers.dev` still serves the same Worker.

## Non-goals

- Discord embed short URL
- `k!schedule` changes
- Historical backfill of contests that ended before the first poll
- Login UI and player accounts
- A public hostname on `karuta-images` (`img.krta.cc` is out)
- A bot POST for contest dumps
- Soft or silent dumps
