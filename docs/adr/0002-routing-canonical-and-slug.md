# ADR 0002: Canonical section paths and internal slugs

## Context

The product needs durable dump URLs and short links that fit in Discord. A generic open shortener would turn `krta.cc/{slug}` into an open redirect.

## Decision

Two or more segments are a document: `/{section}/{id}`. One unreserved six-character segment is a slug that 302s to that document. Slugs may only target internal section paths. Reserved first segments never become slugs. IDs increment per section.

## Alternatives considered

- **Global IDs across sections.** Collapses independent dump types into one counter.
- **Arbitrary external slug targets.** Unsafe and unused by the stated product.
- **Human-readable slugs.** Collision-prone with reserved names and harder to generate uniquely.

## Consequences

Future sections register a reserved first segment before they ship. Discord can post `https://krta.cc/{slug}` once Admin is wired.
