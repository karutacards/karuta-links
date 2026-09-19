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
| `/contests/{id}` | Canonical contest dump. `{id}` is the Card Hunt eventCounter |
| `/drafts/import` | OAuth-gated importer handshake. Accepts a catalog via `postMessage` |
| `/drafts/{id}` | OAuth-gated collaborative draft editor |
| `/{slug}` | 302 to `/{section}/{id}` when the slug exists |
| `/api/v1/content` | Authenticated ingest (`POST` only) |
| `/api/v1/drafts` | Create a draft from a text catalog (`POST` only) |
| `/api/v1/drafts/{id}` | Read a draft (`GET`). `lockIds` can set the description (`PATCH`) |
| `/api/v1/drafts/{id}/events` | Poll new audit rows, current entities, lock state, description and presence (`GET`) |
| `/api/v1/drafts/{id}/entities` | One entity mutation (`PATCH`) |
| `/api/v1/drafts/{id}/entities/{type}/{key}/audit` | Entity audit rows |
| `/api/v1/drafts/{id}/lock` | Lock a draft (`POST`, lock list only) |
| `/api/v1/drafts/{id}/unlock` | Unlock a draft (`POST`, lock list only) |
| `/api/v1/drafts/{id}/restore` | Restore a draft to an Activity save (`POST`, lock list only) |
| `/api/v1/drafts/{id}/export.txt` | KarutaImporter TXT for a locked draft (lock list only) |
| `/api/auth/discord` | Start Discord identify. Optional `next` is `/drafts/import` or `/drafts/{id}` |
| `/api/auth/callback` | Exchange the authorization code and set a session cookie |
| `/api/auth/me` | Session probe. `{ authenticated: false }` or `{ authenticated: true, discordId, username }` |
| `/api/auth/logout` | Clear the session cookie (`POST` only) |
| `/images/…` | Image from `karuta-images`. Character-art keys fall back to CloudFront on a miss. Contest keys do not |
| `/health` | Plain `ok` |
| `/robots.txt` | Allow all |

Reserved first segments: `api`, `assets`, `content`, `contests`, `drafts`, `favicon.ico`, `health`, `images`, `robots.txt`, `static`. Those names never become slugs.

Slugs are exactly six characters in `[a-z0-9]`. They point only at internal `/{section}/{id}` paths. There are no open redirects.

Content and draft IDs increment per section. Contest dump IDs are the Card Hunt `eventCounter`. `/contests/1` is Hunt #1.

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
2. If `eventCounter` is not greater than the last claimed event, stop.
3. Read `contests/card_hunt/events/{eventCounter}`.
4. If `rewarded` is not true, stop. Keep the last-claimed number unchanged.
5. Claim that event in `contest_dumps`. If another cron already claimed it, stop.
6. List `contests/card_hunt/events/{eventCounter}/contest_entries/{card_id}`.
7. Write `/contests/{eventCounter}` and copy framed-card images into `karuta-images` at `contests/card/{eventCounter}/{place}`. The reference card is `contests/card/{eventCounter}/ref`. Contest images are immutable snapshots. Responses send a one-year `Cache-Control` and `CDN-Cache-Control` and are stored in the Workers Cache API.

Canonical path is `/contests/{eventCounter}`.

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

Discord OAuth can issue a signed session cookie (`identify` only). It does not gate dumps, ingest or public dump HTML. There is no Sign in control on those pages. Draft routes require a session. A missing cookie starts OAuth and returns to `/drafts/import` or `/drafts/{id}`. The registered redirects are only `https://krta.cc/api/auth/callback` and `http://127.0.0.1:8787/api/auth/callback`. Local wrangler presents `http://krta.cc` and maps that to the 127.0.0.1 callback. Missing Discord secrets return `503` on the start and callback routes. Ingest and dump pages keep working.

## Collaborative drafts

Drafts are versioned catalog entities, not a live shared document. Public content dumps stay immutable.

`drafts.config.json` is the access file. Discord snowflakes are identifiers, not secrets. Changing it requires a deploy.

`access` is one of:

- `open` — every signed-in user who is not Karuta-blacklisted
- `credentials` — not blacklisted, and at least one configured bar (default: 1,000 drops, 1,000 grabs or one `k!gems` purchase)
- `whitelist` — only IDs in `whitelist`

Every mode checks `blacklist.json.gz` on R2 `karuta-data`. Credentials mode reads `statistics_user/{discordId}` from Firestore. Failed access is `403` with a complete sentence that does not name the failed bar. A missing blacklist or Firestore config fails closed with `503`.

IDs in `lockIds` can lock or unlock a draft and can inline-edit a draft description. Enter or blur saves it. Everyone sees the new text on the next poll. Each lock, unlock or description change writes an Activity event. A description change is not a save and is not a restore target. Those IDs can restore the full draft to the start of a save in Activity. Restore refuses while the draft is locked or the tab has unsaved edits. Import, lock, unlock, describe and restore lines are not restore targets. The restore writes one Activity line and stores a catalog snapshot so a later restore can replay it. Later saves stay in the log. The description stays editable after lock. Locked drafts reject edits with `423`. Those IDs can download a KarutaImporter TXT (`type,action,name,seriesKey,aliases,groups`) from the locked editor. Aliases are joined with `|`. The groups column is empty. Editions and images stay out.

Each series or character has a revision. A save sends the revision it started from. A conflict or a delete-while-edit returns `409` with `CONFLICT` or `ENTITY_GONE` plus the current entity. The editor rebases unsaved edits onto that committed row. Fields this tab did not change take the committed value. Fields both sides changed to different values stay marked as a conflict and cannot save until Discard or another edit. A remote delete drops the row. There are no row locks that last while a tab is open.

Open draft tabs poll `GET /api/v1/drafts/{id}/events?after={id}` every two seconds while visible. The response is not cached. New `draft_audit` rows append to a draft-wide Activity list and update other editors' tables. History is the same audit stream filtered to that series or character. Presence is a `draft_presence` heartbeat; rows older than 10 seconds drop off. A remote lock, unlock or restore reloads the editor and says the draft was locked, unlocked or restored. Lock on this tab refuses while unsaved edits remain. Unsaved rows rebase onto the latest committed entity instead of hiding it.

The KarutaImporter bookmarklet posts a text catalog by opening `https://krta.cc/drafts/import` and `postMessage` from `https://karuta.gswaccess.com`. Each entity may include `action` of `add` or `update`, classified against live Admin data at post time. A character-only paste still includes each parent series' key and name as an `update` so the draft can resolve and display that series. It does not copy that series' aliases. The import page POSTs `/api/v1/drafts` with the session cookie. It does not use `INGEST_TOKEN`. krta.cc does not load the production corpus. Each imported series or character writes an Activity line that says imported and lists aliases when present. Those import lines group together and are not saves.

An `update` row freezes the key, name and imported aliases. The editor marks those rows with an Update chip. Collaborators may add aliases and may remove only aliases added after import. Live rows have no Delete control. Rows created on krta.cc, and imported `add` rows, stay fully editable. A character Series cell looks up a series already on this draft. A name that is not on the draft is a warning: confirm it matches Karuta exactly, because it will be stored as an `update`. Two characters cannot share the same name and series. Deleting an `add` series also deletes its characters. Locked TXT export writes that stored `action`. A blank-draft create path is not implemented.

Draft HTML is a standalone dark editor. It does not use dump page chrome, a home link or a footer. Series and characters are tables. The first row of each table adds an entity. Add series needs a name. Add character needs a name and a series. Successful add rows clear. Two characters cannot share the same name and series. Series names, character names and aliases are limited to 200 characters on the client and the Worker. Karuta Admin does not set a max length, so this cap is the draft limit. Rows sort by newest added first. Each table can sort by last edit or name instead. Alias-only add rows do not offer Save. Save and Discard stay hidden until a row has pending changes. History stays aligned on live rows that have no Delete. Alias chips remove on click. Long aliases ellipsis and show the full name in a tooltip. Hover styles apply only on fine pointers. Enter locks a new alias. Last edited is a column of Discord mentions. History opens a dialog that names the series or character, then that row's audit with timestamps and the same formatting as Activity. A description sits under the title. `lockIds` edit it inline. Everyone else reads it. Unsaved name, series and alias cells share one highlight. Add and Discard stay unhighlighted. A conflicted cell uses the danger highlight and blocks Save. Removed aliases stay faded until save. Delete dims the row until save. Click Delete again to restore. Save all writes dirty rows. A description saves on Enter or blur and is not part of that save. Discard and Discard all revert unsaved edits. Activity names the series or character before each title and uses the series name, not the key. Presence chips sit in the header. Activity is a live rail of complete-sentence audit lines. Import events and events from one Save or Save all group together. `lockIds` see a restore icon on a save group, never on an import. The group shows its save id after the timestamp. A restore names that id and replays through the last event in the save. Groups a restore left behind are dimmed. History does not restore. The rail sizes to its events and caps at the catalog height when the page scrolls. If the catalog fits on the page, the rail may use the leftover viewport. Narrow viewports stack the catalog above Activity, hide Last edited, and stack each row so actions stay on one line.

The Worker is attached at `krta.cc`. `workers.dev` still serves the same Worker.

## Non-goals

- Discord embed short URL
- `k!schedule` changes
- Historical backfill of contests that ended before the first poll
- Login UI and player accounts
- A public hostname on `karuta-images` (`img.krta.cc` is out)
- A bot POST for contest dumps
- Soft or silent dumps
