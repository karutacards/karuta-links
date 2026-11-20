# Deploy

Last updated: November 20, 2026.

Production names are `karuta-links` for the Worker and the D1 database. `wrangler.jsonc` must keep `"name": "karuta-links"`. There is no CI and no automatic deploy, so every release runs from a developer machine with Wrangler.

## First-time remote setup

1. Confirm Wrangler is logged into the shared Karuta Cloudflare account: `pnpm exec wrangler whoami`.
2. Create D1: `pnpm exec wrangler d1 create karuta-links`.
3. Put the returned `database_id` into `wrangler.jsonc`.
4. Apply every migration: `pnpm run db:migrate:remote`.
5. Confirm `wrangler.jsonc` binds R2 `karuta-images` as `IMAGES` and R2 `karuta-data` as `KARUTA_DATA`. The Worker reads the Karuta blacklist from `karuta-data`.
6. Confirm `wrangler.jsonc` declares the `DRAFT_WRITE` and `REPORT_REVIEW` rate limits.
7. Set the ingest secret: `pnpm exec wrangler secret put INGEST_TOKEN`.
8. Set the report-review secret: `pnpm exec wrangler secret put REPORT_REVIEW_TOKEN`. Do not reuse the ingest value. Leave it unset to keep the review routes dark (`503`).
9. Set the Firestore secrets for the Card Hunt poll, drafts and reports: `FIRESTORE_PROJECT_ID` and `FIRESTORE_SERVICE_ACCOUNT`. Use a read-only service account. Do not print the JSON.
10. Optional catalog fan-out: `pnpm exec wrangler secret put GITHUB_DISPATCH_TOKEN`. Use a fine-grained PAT on `karutacards/karuta-submissions` only, with Contents set to Read and write. Metadata Read is selected with it. Actions write does not authorize `repository_dispatch`. `wrangler.jsonc` already sets `CATALOG_DISPATCH_REPO` to that repository. Leave the token unset to skip the dispatch.
11. Optional Discord OAuth: `pnpm exec wrangler secret put DISCORD_CLIENT_ID`, then `DISCORD_CLIENT_SECRET`, then `SESSION_SECRET`. Register `https://krta.cc/api/auth/callback` on that Discord application. Do not reuse karuta.cards secrets. Leave these unset if OAuth should stay dark.
12. Deploy: `pnpm run deploy`.

Do not pass a secret value on the command line.

## Later deploys

```bash
pnpm test
pnpm typecheck
pnpm run deploy:dry-run
pnpm run deploy
```

Apply new migrations with `pnpm run db:migrate:remote` before or with the deploy that needs them. Draft access lives in `drafts.config.json`, so changing who may use drafts also needs a deploy.

## Rollback

Use `pnpm exec wrangler rollback` for the Worker. D1 migrations are not reversed automatically, so a release that changes the schema needs a forward fix rather than a rollback.
