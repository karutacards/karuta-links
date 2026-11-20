# Handoff: Admin ingest vs Bot Fight Mode

**Next session:** find a durable way for Karuta Admin's hard-publish `POST https://krta.cc/api/v1/content` to reach the Worker. The user wants a Cloudflare rule if one exists. Do not settle for a single AWS IP allow unless you can show the egress address is pinned.

As of Sept. 21, 2026. Re-verify Cloudflare docs and the live Security Events before changing the zone.

## Goal

Hard production publishes from Admin must create a krta.cc content dump without a human backfill. Soft and silent publishes must still skip ingest.

Success: the next real Admin hard publish returns HTTP 201 from the Worker (not a Cloudflare challenge or 403) and a new `/content/{id}` appears. A Security Event for `3.15.83.21` (or the then-current Admin IP) must not show Bot Fight Mode Managed Challenge on that POST.

## Why this is urgent

Admin already POSTs. Cloudflare Bot Fight Mode answers the request before the Worker runs. Admin's axios call sees 403, logs `Content ingest failed` and continues the Karuta publish. Discord still announces. krta.cc gets nothing. Catalog refresh also never fires because it is `waitUntil` after a successful insert.

This happened at least twice:

| When (EDT) | Security Event | Result |
| --- | --- | --- |
| Sept. 20, about 1:47 a.m. | Managed Challenge, `3.15.83.21`, Bot fight mode | JJK publish. No dump. Backfilled as [Content update #2](https://krta.cc/content/2). |
| Sept. 21, 12:27 a.m. | Same IP, same service, same action | Ikkitousen / Maken-ki! editions. No dump. Backfilled as [Content update #3](https://krta.cc/content/3). |

A Skip at Sept. 20, 11:45 p.m. EDT from `75.89.74.255` (Custom rules) is the synthetic JJK POST from the workstation. That rule logged. It does not protect Admin.

krta.cc home still showed only dumps 1-3 after the second miss. Latest catalog Action remains the Sept. 20, 07:10 UTC cron (`35496159937`). There are zero `repository_dispatch` runs on `karutacards/karuta-submissions`.

## What is not the bug

- **Worker 403.** `src/app.ts` ingest returns 401 (bad bearer), 400 (JSON / parse) or 413 (too large). It does not return 403.
- **Empty editions.** JJK was 27 new characters and alias rows. Valid 201.
- **Payload shape.** Admin `Manager.publishData` already builds the body `src/ingest.ts` accepts, including `seriesChanges` / `characterChanges`. Ingest keeps `aliases.added` only. Groups and removals are dropped.
- **The custom Skip checkboxes.** The live rule already skips Super Bot Fight Mode for `POST` + path `/api/v1/content`. The events say **Bot fight mode**, not Super Bot Fight Mode. None of the Skip component checkboxes is Bot Fight Mode. Cloudflare documents that you cannot skip BFM with a custom Skip.

## Admin client (read-only unless the user opens that tree)

Repo: `J:\karuta-admin`, branch `actionqueue`, commit `1120fcc` when last pulled.

- Trigger: hard production publish only (`!soft && !skipWebhook && type === 'production'`).
- Client: `axios@0.19.2`, 10 second timeout, default User-Agent `axios/0.19.2`.
- Egress seen twice: AWS `3.15.83.21`.
- Failure: `console.error('Content ingest failed', { publishId, counts, status, code })`. No response body. Publish is not rolled back.
- Bearer is hardcoded in `backend/src/Manager.js`. **Never print it. Never put it in a shell command line.** If you need to POST, read the file in-process and log only status and dump id. Treat the value as exposed; rotate `INGEST_TOKEN` on the Worker and move Admin to env. Discord webhook URLs in `backend/src/WebhookManager.js` are also hardcoded. Do not print those either.

Existing Admin contract notes: [karuta-admin-ingest.md](karuta-admin-ingest.md), [karuta-admin-publish-data.md](karuta-admin-publish-data.md).

## Cloudflare facts this session used

Re-read these. They change.

- [Skip options](https://developers.cloudflare.com/waf/custom-rules/skip/options/) — you can skip Super Bot Fight Mode (`http_request_sbfm`). Quote: you cannot skip Bot Fight Mode.
- [BFM false positives](https://developers.cloudflare.com/bots/troubleshooting/false-positives/) — custom Skip and Page Rules do not bypass BFM. An IP Access **Allow** that **matches** the connecting IP prevents BFM on that request. BFM can still fire for non-matching IPs even if other Access rules exist.
- [Get started with BFM](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) — BFM is not in the Ruleset Engine.
- [Super Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/super-bot-fight-mode/) — Pro and up. Custom Skip works. That is the product the existing rule was written for.
- IP Access **Allow** also bypasses custom rules, rate limits and managed rules. Allowing Amazon ASN `AS16509` would survive IP churn and would also open those layers to all of AWS. Rejected.

The Skip rule the user already has:

- When: `POST` and URI path `/api/v1/content`
- Then: Skip → All Super Bot Fight Mode rules
- Log: on. Active.

Do not add more Skip checkboxes hoping BFM is hiding in "managed rules" or "security level." Those are different products. The 00:27 event's service column was **Bot fight mode**.

## Solutions this session ranked

The user rejected pinning `3.15.83.21` because AWS NAT will move. Agree.

1. **Turn Bot Fight Mode off** on the `krta.cc` zone. Ingest already requires `INGEST_TOKEN`. Unauthenticated POSTs die at the Worker. This is the simplest correct design if the zone is on free BFM and they do not want to pay for Super Bot Fight Mode.
2. **Upgrade to Super Bot Fight Mode**, turn BFM off (both must not run) and keep the existing path Skip. Path-based. No IP. This is Cloudflare's intended exception model.
3. **IP Access Allow** for a **stable** Admin egress (Elastic IP the Admin host owns). Works today for `3.15.83.21`. Breaks on the next NAT change unless they pin it. Do not Allow `AS16509`.

Rejected as the primary fix:

- More WAF Skip components on the current rule.
- A second ingest URL (`workers.dev` or another hostname) so BFM never sees Admin. Parallel path.
- Changing axios User-Agent only. Datacenter IPs still trip BFM. axios also cannot pass a Managed Challenge.
- Reconstructing dumps by hand after every publish.

If you find a current dashboard control that skips BFM per path, that wins over turning BFM off. Prove it from Cloudflare's docs or a test POST from an AWS-like client, not from the Skip checkbox list we already screened.

## How to prove a fix

Do not use the production bearer in chat. Prefer a throwaway token or a request that you can identify in Security Events (custom User-Agent) once the user authorizes a test.

1. Record the current Bot Fight Mode / Super Bot Fight Mode / IP Access state (screenshots or field list, no secrets).
2. Apply one change the user explicitly names.
3. `POST /api/v1/content` from a client that looks like Admin (datacenter IP or the real Admin host) and from the workstation.
4. Worker 201 plus no BFM Managed Challenge on that POST. Then wait for a real Admin hard publish.

A Skip log from `75.89.74.255` is not proof. That is the workstation.

## Synthetic dumps already on production

Do not POST these again.

- [#2](https://krta.cc/content/2) — JJK. 1 updated series, 27 new characters, 1 series alias row, 7 character alias rows. Built from R2 `karuta-data/production.json.gz` plus `C:\Users\craig\Downloads\draft-1.txt`.
- [#3](https://krta.cc/content/3) — 25 new-edition rows from the Discord announce list (Ikkitousen, Ikkitousen: Dragon Destiny, Maken-ki!). Pre-publish catalog only had edition 1. Genpou Saji is keyed `genpou-saji` and labeled Dragon Destiny as the announce post said; the stale catalog still files that name under Ikkitousen.

Catalog gzip on R2 was last refreshed by the Sept. 20 cron. It does not include the editions publish until a catalog job runs.

## Follow-up: catalog dispatch is silent

After a 201, `src/app.ts` calls `waitUntil(dispatchCatalogRefresh)` (`src/catalog-refresh.ts`). Event `karuta-catalog-refresh` to `CATALOG_DISPATCH_REPO` (`karutacards/karuta-submissions`). Cards workflow `.github/workflows/update-karuta-data.yml` listens and then POSTs the today deploy hook.

`GITHUB_DISPATCH_TOKEN` exists on Worker `karuta-links`. `wrangler.jsonc` has the repo var. GitHub still has no `repository_dispatch` runs. The fetch is failing or ignored (PAT scopes are the first guess). Failures are `console.warn` only. Dump 201 does not depend on dispatch.

Do not block the BFM fix on this. After ingest works, `workflow_dispatch` the catalog job if cards/today must move before the daily cron.

## Secrets and scope

- Never print `INGEST_TOKEN`, Admin's hardcoded bearer, Discord webhook URLs, Doppler values or GitHub PAT values.
- Agent Doppler: names only via the vault guard. Never `doppler secrets get`.
- Do not edit Admin or change router/gateway settings unless the user names that device and change.
- Do not edit `wrangler.toml` in karuta.cards to point at dev resources.
- Project scope: `krtacc` plus Cloudflare dashboard for `krta.cc`. Read Admin. Write Admin only if the user opens that work.

## Repos

| Tree | Role |
| --- | --- |
| `c:\Users\craig\Projects\krtacc` | Worker. This file. `SPEC.md` wins. |
| `J:\karuta-admin` | Publisher. Read unless asked to patch. |
| `c:\Users\craig\Projects\karutacards` | Catalog Action and R2. |
| `c:\Users\craig\Projects\karutatoday` | Static calendar. Rebuild hook after R2. |
| Projects vault `krta.cc/` | Operating notes. Stale on "Admin not wired." |

## Suggested skills

Cloudflare WAF / Bots docs (Context7 or current developers.cloudflare.com). `Architecture/Cloudflare.md` in the Artificial Intelligence vault for account rate limits only. Design Intent: do not add a second ingest channel to dodge BFM.

*Written by Cursor*
