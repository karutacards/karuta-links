# Handoff: discordcards contest dump

Bryan’s poll recipe (Sept. 17, 2026). No bot POST. No change in `discordcards`.

`k!test ContestPreviewJudging` stays a staff replay. Do not hook it.

This Worker will read Firestore the way `karuta-data-interface` does (a service-account client). Do not npm-install that Node package here. The Worker uses Firestore REST, same idea as karuta.cards.

## Split of work

**Bot:** none.

**krta.cc**

1. Cron every minute.
2. Follow the poll below.
3. When `rewarded` is true for a new event, snapshot the event and its entries, copy framed-card images, write `/contests/{id}`.

## Poll (authoritative)

1. Read `contests/card_hunt`.
2. Compare `eventCounter` to the last **dumped** event. If it is not greater, stop.
3. Read `contests/card_hunt/events/{eventCounter}`.
4. If `rewarded` is not true, stop. Keep the last-dumped number unchanged so the next minute retries the same event.
5. If `rewarded` is true, the dump is that event document plus every doc under:

```
contests/card_hunt/events/{eventCounter}/contest_entries/{card_id}
```

Advance last-dumped only after the HTML page exists.

Most ticks are two document reads. List entries only when step 5 runs (about once per contest, a minute after rewards).

## What to store from those docs

Use saved fields. Do not call Gemini. Do not re-render. Do not use `getCharacterImageURL` (that is unframed edition art).

From the event document: prompt, scores, winners, buy-in, currency, reference card, `referenceImageUrl`, `referenceJudgingImageUrl`, `judgingFinishedAt`.

From each entry: code, edition, number, `metaCharacterId`, `metaSeriesId`, `contestSubmitter`, `contestSubmittedAt`, `contestScore`, `contestImageUrl`, `contestJudgingImageUrl`.

`contestImageUrl` is the permanent framed card. Copy those bytes into dump-scoped `/images/contests/…` so the page does not depend on CloudFront. `contestJudgingImageUrl` is the three-day textless cache; copy it at ingest if present, and do not require it later.

Missing image URLs are placeholders. Pages are public; submitter ids are on the entries. Decide display on our HTML, not by changing Firestore.

## Out of scope

- `POST /api/v1/contests` from the bot
- `img.krta.cc`
- Pointing the card renderer at krta.cc
- Historical backfill of events below the first `eventCounter` we see
- Other contest names until a second parent doc is named

*Written by Cursor*
