# Architecture

One Cloudflare Worker serves HTML, redirects and the ingest API. One D1 database stores documents, slugs and per-section sequences.

```
POST /api/v1/content  -->  D1 documents + slugs
GET  /content/{id}    <--  snapshot HTML
GET  /{slug}          -->  302 /content/{id}
GET  /                <--  recent dumps
```

## Why a Worker

karuta.today is a static Pages site. That model cannot accept writes. karuta.cards uses Pages Functions, which fight a single-segment slug next to `/{section}/{id}`. A Worker owns the whole hostname.

## Data

Tables: `sequences`, `documents`, `slugs`. A content dump is an immutable JSON snapshot on `documents`. The matching short link is one row in `slugs`.

Images are not stored here. Ingest writes official CloudFront URLs onto the snapshot.

## Auth

`INGEST_TOKEN` is a Worker secret. Local development reads `.dev.vars`. Public routes do not require auth.

## Rendering

Hono handlers return server-rendered HTML. There is no client application. Escaping is the XSS defense.
