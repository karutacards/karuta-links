# Getting started

Linux or WSL plus Docker is the supported path. Host-global Node is not required when you use Compose. A local Node 22 plus Corepack pnpm install also works.

## Prerequisites

- Docker Engine and Docker Compose, or Node 22 with Corepack
- A copy of this repository

## Configure

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` is local-only. Do not commit it. The example token is `dev-ingest-token`. Card Hunt polling also needs `FIRESTORE_PROJECT_ID` and `FIRESTORE_SERVICE_ACCOUNT` (the service-account JSON as one line). Leave those empty to skip the cron locally. Leave `GITHUB_DISPATCH_TOKEN` empty to skip the karuta.cards catalog dispatch.

Discord OAuth is optional for dumps. Leave `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `SESSION_SECRET` empty to skip it. Draft routes need those secrets, R2 `karuta-data` as `KARUTA_DATA`, and the same Firestore pair Card Hunt uses. `drafts.config.json` chooses `open`, `credentials` or `whitelist`. Put lock-capable Discord IDs in `lockIds`. To try the unadvertised flow locally, put the Discord values in `.dev.vars` (never in chat) and register `http://127.0.0.1:8787/api/auth/callback` on the Discord application. Then open `http://127.0.0.1:8787/api/auth/discord`. Production also needs `https://krta.cc/api/auth/callback`. Do not reuse the karuta.cards application or its `SESSION_SECRET`.

## Run with Docker

```bash
docker compose up --build
```

The Worker listens on `http://127.0.0.1:8787`. Apply local D1 migrations once before the first request:

```bash
docker compose run --rm app pnpm run db:migrate:local
```

## Run on the host (WSL)

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm test
pnpm typecheck
pnpm dev
```

## Post a sample dump

```bash
curl -sS -X POST http://127.0.0.1:8787/api/v1/content \
  -H "Authorization: Bearer dev-ingest-token" \
  -H "Content-Type: application/json" \
  --data-binary @docs/fixtures/sample-content.json
```

Open the returned `url` or `shortUrl`. The home page lists recent dumps.

## Tests

```bash
pnpm test
pnpm typecheck
```
