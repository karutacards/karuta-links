# Handoff: hard-publish catalog fields

Read-only against `J:\karuta-admin` until a later pass. This file is the field map for one hard production publish. It is not permission to edit that tree. The dump POST contract is [karuta-admin-ingest.md](karuta-admin-ingest.md).

Hard publish is `POST /api/publish/production` with `{ edits, income, draft }`. That is Sidebar **Hard publish (immediate, notify)**. Soft and silent routes call the same `Manager.publishData` with `soft` or `skipWebhook`. They must not POST to krta.cc.

`draft` is the numbered Admin slot. `income` is the payout total. Neither is catalog data. The draft body is `edits`.

## Where the full records are

Do not scrape Discord. Do not POST the whole catalog. Do not treat the webhook arrays as objects.

After the series and character loops in `publishData` (including `processEditionReleaseDates`) and before the delayed Discord embed:

| Source | What it is | Use it? |
| --- | --- | --- |
| `mutableSeriesMap.get(key)` / `mutableCharactersMap.get(key)` | Persisted record after merge: aliases, groups, flags, timestamps and the full `editions` map with `releaseDate` / `jitter` | **Yes.** Harvest every key in `edits.series` and `edits.characters` from these maps. |
| `edits.series` / `edits.characters` | Same objects the frontend stored. The editor writes a full merged row (`{...live, ...edit}`), not a field patch. Manager then strips frontend-only keys and writes timestamps. | Close, but prefer the maps so `added` / `updated` and new-edition schedule fields are the persisted values. |
| `newSeries`, `updatedSeries`, `newCharacters` | Full series or character objects. `newCharacters` still has an `editions` object. | Fine for membership. Do not stop here if you also need edition slots on existing characters. |
| `newEditions`, `updatedEditions` | Character spread with `editions` replaced by an **array of edition number strings**. Objects and aliases are gone. | Use only the numbers, via `changes.characters[key].newEditions` / `updatedEditions`. |
| `changes` | Diff flags plus those edition-number lists | Classify new vs updated. Not a data source. |
| Redis `__prod_contentUpdate` | JSON of the mutated `edits` draft | Bot cache. Not the krta.cc path. |
| Staff Firestore `karuta_staff/{submitter}/submissions/{time}` | `{ edits, type, time, income, draft }` after sanitize | Audit of that draft. Not the live hook. |
| S3 `production.json.br` | **Every** series and character after the merge | Shared catalog refresh. Too large for `/api/v1/content` (1,000,000-byte cap). Not “this publish.” |
| Discord embed | Names and edition numbers. `WebhookManager` also clears `updatedSeries` before send. | Never. |

`seriesName` is not persisted. The frontend deletes it. Resolve the display name with `mutableSeriesMap.get(character.series).name`.

## Harvest

Run this only for hard production (`type === 'production'`, `soft === false`, `skipWebhook === false`), after S3 and Redis succeed.

1. For each `edits.series` key, take `mutableSeriesMap.get(key)`.
2. For each `edits.characters` key, take `mutableCharactersMap.get(key)`.
3. Classify with the existing arrays and `changes`: new vs updated series, new characters, new vs updated edition numbers (`parseInt(key) <= maximumEdition` only).
4. Project the slim dump POST from those records. See [karuta-admin-ingest.md](karuta-admin-ingest.md). Extra fields on the harvest (aliases, groups, schedule) are not stored on dump pages today.

Do not send `mutableData` (the full `series` and `characters` arrays).

## Series record

Copied from the series editor and what `publishData` writes.

| Field | Shape | Notes |
| --- | --- | --- |
| `key` | string | Immutable. |
| `name` | string | Required. Empty name fails the publish. |
| `aliases` | string[] or omitted | Chips in the series editor. |
| `groups` | string[] or omitted | Chips in the series editor. |
| `noTransfer` | boolean or omitted | “Disable Transfers.” |
| `added` | number (ms) | Set on create. Preserved on update. |
| `updated` | number (ms) | Set on every publish of that row. |

## Character record

| Field | Shape | Notes |
| --- | --- | --- |
| `key` | string | Immutable. |
| `name` | string | Required. |
| `series` | string | Series **key**. Must exist in the live catalog or in this draft. |
| `aliases` | string[] or omitted | Chips in the character editor. |
| `groups` | string[] or omitted | Chips in the character editor. |
| `submitter` | string or omitted | Discord id on the character row. Not `edits.submitter`. |
| `disabled` | boolean | “Disable drops.” |
| `editions` | object map | Keys are edition numbers as strings. See below. New characters may publish with `{}`. |
| `added` | number (ms) | Set on create. Preserved on update. |
| `updated` | number (ms) | Set on every publish of that row. |

Stripped before persist and not harvest targets: `hash` on each edition, `version` when it is `0`, `wishlists`, `seriesName`.

## Edition object

`character.editions[n]` after merge, where `n` is `"1"`, `"2"`, …

| Field | Shape | Notes |
| --- | --- | --- |
| `version` | number or omitted | Omitted when `0`. Greater than `0` means `cards/versioned/{key}-{edition}-{version}.jpg`. |
| `releaseDate` | number (ms) | Written for **new** edition slots in this publish. Existing slots keep the live `releaseDate` even if the draft changed it. |
| `jitter` | number or omitted | Set with `releaseDate` for new slots. |

Art bytes are not in the JSON. They are already on Karuta’s card host. Dump pages use `/images/cards/…` and the Worker fills R2 from that host on a miss.

## Projecting the dump POST

From the harvested maps, the body [SPEC.md](../../SPEC.md) already accepts is:

- `newSeries` / `updatedSeries`: `{ key, name }`
- `newCharacters`: `{ key, name, series, seriesName? }`
- `newEditions` / `updatedEditions`: `{ key, name, series, seriesName?, editions }`

`editions` here is a non-empty array of numbers or `{ edition, version? }`. Take the numbers from `changes.characters[key].newEditions` or `updatedEditions`. Take `version` from `character.editions[n].version` when it is greater than `0`.

`seriesName` may be omitted when that series key is in `newSeries` or `updatedSeries` in the same body. Otherwise set it from the series map.

Aliases, groups, flags and release dates stay on the harvest. They are not dump fields until SPEC says so.

## Out of scope

- Editing `karuta-admin` in this pass
- Soft or silent publishes
- Development “Test on development”
- Discord short URL and `k!schedule`
- Replacing the shared catalog Action with this POST
- Historical backfill from staff submission docs

*Written by Cursor*
