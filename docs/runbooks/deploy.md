# Deploy

Production names are `karuta-links` for the Worker and the D1 database. `wrangler.jsonc` must keep `"name": "karuta-links"`.

## First-time remote setup

1. Confirm Wrangler is logged into the shared Karuta Cloudflare account: `pnpm exec wrangler whoami`.
2. Create D1: `pnpm exec wrangler d1 create karuta-links`.
3. Put the returned `database_id` into `wrangler.jsonc`.
4. Apply migrations: `pnpm run db:migrate:remote`.
5. Set the ingest secret: `pnpm exec wrangler secret put INGEST_TOKEN`.
6. Set Firestore secrets for the Card Hunt poll: `FIRESTORE_PROJECT_ID` and `FIRESTORE_SERVICE_ACCOUNT`. Use a read-only service account. Do not print the JSON.
7. Confirm `wrangler.jsonc` binds R2 `karuta-images` as `IMAGES`.
8. Apply `0002_contest_dumps.sql` with `pnpm run db:migrate:remote`.
9. Deploy: `pnpm run deploy`.

Do not pass the secret value on the command line.

## Later deploys

```bash
pnpm test
pnpm typecheck
pnpm run deploy:dry-run
pnpm run deploy
```

Apply new migrations with `pnpm run db:migrate:remote` before or with the deploy that needs them.

## Rollback

Use `pnpm exec wrangler rollback` for the Worker. D1 migrations are not automatically reversed.
