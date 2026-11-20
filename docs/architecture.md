# Architecture

Last updated: November 20, 2026.

One Cloudflare Worker serves HTML, redirects, content ingest, the unadvertised Discord-gated tools and a one-minute Card Hunt poll. One D1 database stores everything the Worker writes. SPEC.md has the full route table and behavior.

```
POST /api/v1/content           -->  D1 documents + slugs (Bearer INGEST_TOKEN)
                               -->  waitUntil GitHub repository_dispatch (catalog refresh)
GET  /                         <--  recent content and contest dumps
GET  /content/{id}             <--  content snapshot HTML
GET  /contests                 <--  recent Card Hunt dumps
GET  /contests/{id}            <--  contest snapshot HTML
GET  /{slug}                   -->  302 /{section}/{id}
GET  /images/*                 <--  R2 karuta-images, character art filled from CloudFront
GET  /api/auth/*               -->  Discord identify (unadvertised)
GET  /drafts/import            -->  OAuth-gated importer handshake
GET  /drafts/{id}              -->  OAuth-gated draft editor
     /api/v1/drafts/*          -->  Session cookie: create, read, entity saves, events poll,
                                    audit, review, lock, unlock, hide, unhide, config,
                                    restore, export.txt
GET  /report, POST /report     -->  OAuth-gated cheat-report form, stored in D1
GET  /report-og.webp           <--  report embed thumbnail
GET  /api/v1/reports[/{id}]    -->  Bearer REPORT_REVIEW_TOKEN, read-only
GET  /albums                   -->  503 (the planner is switched off)
cron * * * * *                 -->  Firestore poll, then D1 + R2
```

## Why a Worker

karuta.today is a static Pages site. That model cannot accept writes. karuta.cards uses Pages Functions, which fight a single-segment slug next to `/{section}/{id}`. A Worker owns the whole hostname.

## Data

Tables: `sequences`, `documents`, `slugs`, `contest_dumps`, `drafts`, `draft_entities`, `draft_audit`, `draft_presence`, `draft_reviews`, `reports`, `report_bans`, `album_snapshots`. A dump is an immutable JSON snapshot on `documents`. The matching short link is one row in `slugs`. `contest_dumps` records which Card Hunt `eventCounter` values already have a page. Drafts are mutable: one row per draft, one versioned entity per series or character, and an append-only audit stream that also records imports, lock, unlock, hide, unhide, access-config changes, description changes and restores. An imported entity keeps `import_action` and `base_aliases` so live rows export as updates. Open editors poll that stream and heartbeat `draft_presence`. A locked draft stores each user's approve or reject mark on `draft_reviews` until unlock. Player cheat reports are append-only `reports` rows. `report_bans` blocks reporters from `/report`. A machine review token can list those rows. There is no staff inbox in this Worker.

Content-dump HTML uses same-origin `/images/characters/…` paths, and `/images/cards/…` redirects there. Those objects are unframed edition art. The Worker reads private R2 `karuta-images` and falls back to Karuta's uncached CloudFront host on a miss.

Contest HTML uses `/images/contests/card/{event}/{place}`. The reference card is `/images/contests/card/{event}/ref`. Those objects are framed cards copied from the URLs saved on the Firestore entries. A miss does not fall back to character-art CloudFront. Contest image responses are cached for one year at the browser and the Cloudflare edge. They do not change after the dump.

## Card Hunt poll

Every minute the Worker reads `contests/card_hunt`. If `eventCounter` is greater than the last claimed event and that event's `rewarded` field is true, it reads the entries, then claims the event and writes `/contests/{eventCounter}` in one D1 transaction, and copies framed-card images. A failed read or write leaves no claim, so the next minute tries again. A later cron does not pick up a claimed event. For a day after a contest is written, each poll retries any of its framed-card copies that are still missing. It does not npm-install `karuta-data-interface`. Firestore REST uses `FIRESTORE_PROJECT_ID` and `FIRESTORE_SERVICE_ACCOUNT`.

## Auth

`INGEST_TOKEN` is a Worker secret for content ingest. `REPORT_REVIEW_TOKEN` is a separate secret for reading `reports`. Do not reuse the ingest bearer. Local development reads `.dev.vars`. Public routes do not require auth. Contest dumps are not ingested over HTTP.

A successful content ingest may also `waitUntil` GitHub `repository_dispatch` (`karuta-catalog-refresh`) so karuta.cards can refresh shared `karuta-data` R2 from S3. That uses `GITHUB_DISPATCH_TOKEN` and `CATALOG_DISPATCH_REPO`. A missing token or a failed dispatch does not change the ingest `201`. krta.cc does not pull or store `production.json`.

Discord identify is wired and unadvertised. Start and callback routes live under `/api/auth`. A signed session cookie is issued when the Discord application credentials and a session signing key are set. Missing credentials return `503` on those two routes. `GET /api/auth/me` reports the cookie. `POST /api/auth/logout` clears it. Dumps stay public. There is no login control on dump HTML. Draft pages require a session and drafts.config.json. `/report` uses the same session cookie and the same credential bars. It does not read `drafts.config.json`. Form-bans are a separate D1 table. `/albums` is dark. Those routes return 503. The `albums` segment stays reserved.

## Rendering

Hono handlers return server-rendered HTML. Dump pages have no client application. Report pages use Karuta-branded night chrome and validate Discord snowflakes, Karuta card, dye and Idol codes, and optional offense dates. Unsigned `GET /report` returns that HTML with Open Graph title, description and a 256-pixel lossless transparent WebP thumbnail so Discord can unfurl the URL, then starts OAuth. Signed report pages place the session Discord avatar to the right of the heading. `GET /report-og.webp` serves that thumbnail. It is not a favicon. `og:image` currently appends `?v=badge` to bust Discord's unfurl cache; drop that query after the crawler refreshes. The master, exports and prompts live in [report-og](report-og/README.md). The draft editor polls `/api/v1/drafts/{id}/events` while the tab is visible. Escaping is the XSS defense.
