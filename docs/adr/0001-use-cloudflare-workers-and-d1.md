# ADR 0001: Use Cloudflare Workers and D1

## Context

krta.cc must accept authenticated writes, list dumps and redirect short slugs. Sibling sites on the same Cloudflare account are either fully static (karuta.today) or Pages Functions (karuta.cards).

## Decision

Ship one Worker named `karuta-links` with a D1 database of the same name. Render HTML on the Worker. Keep card art on the official Karuta CDN.

## Alternatives considered

- **Static Pages.** Cannot ingest dumps at request time.
- **Pages Functions.** File-based routes make `/{slug}` versus `/{section}/{id}` awkward.
- **KV-only shortener.** Cannot increment per-section IDs or list recent dumps cleanly.
- **R2 image mirror.** Correct for third-party sites. This project is official Karuta.

## Consequences

Local and production use Wrangler. Custom domain attachment is a later DNS step. Admin integration posts into this Worker rather than writing D1 itself.
