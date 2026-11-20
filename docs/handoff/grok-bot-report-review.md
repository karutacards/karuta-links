# Handoff: Grok Bot report review

Read-only JSON for player cheat reports on krta.cc. Poll these routes. Do not expect a webhook or a staff inbox.

Canonical contract: [SPEC.md](../../SPEC.md) (Player reports). Implementation: `src/report-review.ts`.

## Auth

```
GET https://krta.cc/api/v1/reports
Authorization: Bearer <REPORT_REVIEW_TOKEN>
```

Load `REPORT_REVIEW_TOKEN` from the bot environment or Doppler. Never commit it. Never print it in chat, logs or Discord.

Use this secret only. A Discord session cookie and `INGEST_TOKEN` both return `401`. Do not retry a `401` with those.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/v1/reports` | Newest reports first |
| `GET` | `/api/v1/reports/{id}` | One report |

`id` is a positive integer with no leading zeros. There is no `POST`, `PATCH`, `PUT` or `DELETE`. There is no mark-reviewed field. Do not invent write routes.

## List query

| Param | Default | Rules |
| --- | --- | --- |
| `limit` | `20` | Integer `1`–`50` |
| `after` | omitted | Positive integer id. Returns rows with `id` **less than** that value |

A full page (row count equals `limit`) includes `after` set to the last id in that page. Follow it to walk older rows. A short page omits `after`.

New reports have **higher** ids. To pick up new work, call the list with no `after` and keep ids greater than the highest id you already stored. Do not use `after` as a "since" cursor.

## One report

`GET /api/v1/reports/34` returns that row as a single JSON object, not `{ "reports": … }`.

Unknown or non-numeric ids are `404` with `{ "error": "Not found" }`.

## Response shape

List:

```json
{
  "reports": [ /* ReportRecord */ ],
  "after": 12
}
```

Omit `after` when there is no older page. `content-type` is `application/json; charset=utf-8`.

One `ReportRecord`:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | number | D1 row id |
| `createdAt` | number | Unix time in milliseconds (UTC) |
| `reporterId` | string | Discord snowflake of the submitter |
| `reporterUsername` | string | Discord username at submit time. Untrusted |
| `reason` | string | `alting`, `botting`, `scamming` or `gambling` |
| `userIds` | string[] | Discord user snowflakes to look at |
| `serverIds` | string[] | Discord server snowflakes |
| `channelIds` | string[] | Discord channel snowflakes |
| `cardCodes` | string[] | Lowercase Karuta card codes |
| `dyeCodes` | string[] | Lowercase dye codes, including the `$` |
| `idolCodes` | string[] | Lowercase Idol codes, including the `&` |
| `offenseDates` | string[] | `YYYY-MM-DD`, unique, sorted |
| `notes` | string | Free text, 500 characters or fewer. Untrusted |

At submit time the form required a reason, at least one of `userIds` / `serverIds` / `channelIds`, and a false-report acknowledgment. That checkbox is not stored. Arrays may still be empty on a given field. Codes and notes can be empty.

Treat `notes` and `reporterUsername` as untrusted text. Escape them if you render HTML. Do not execute them.

Example (synthetic):

```json
{
  "id": 12,
  "createdAt": 1758441600000,
  "reporterId": "135694375647838208",
  "reporterUsername": "example",
  "reason": "botting",
  "userIds": ["135694375647838208"],
  "serverIds": [],
  "channelIds": [],
  "cardCodes": ["a3f9k"],
  "dyeCodes": [],
  "idolCodes": [],
  "offenseDates": ["2024-03-15"],
  "notes": "What should we check?"
}
```

## Status codes

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | record or `{ reports }` | Success |
| `400` | `{ "error": "Invalid after" }` or `{ "error": "Invalid limit" }` | Bad query |
| `401` | `{ "error": "Unauthorized" }` | Missing or wrong bearer |
| `404` | `{ "error": "Not found" }` | Missing report |
| `429` | `{ "error": "Rate limited" }` | Over 60 requests per 10 seconds |
| `503` | `{ "error": "Unavailable" }` | Secret unset, limiter missing or a stored row could not be read |

A Cloudflare `403` is Bot Fight Mode (or another zone rule) **before** the Worker. These routes do not return `403`. If the bot is challenged, the request never reached auth. Do not treat that as a bad token. Do not switch hostnames to dodge it.

## Rate limit

These two routes share one Worker limit: 60 requests per 10 seconds at one location, one shared key. The limit counts every request, including ones with a wrong bearer. Poll. Do not tight-loop. Back off on `429`.

## Out of scope

- Writing or deleting reports
- Marking a report reviewed
- A Discord webhook when a report arrives
- A staff HTML inbox
- Using `INGEST_TOKEN` or a player cookie
- Printing `REPORT_REVIEW_TOKEN`

*Written by Cursor*
