---
milestone: 1.0
---

# Undeclared field keys

When a field is renamed or removed in the config, its stored values sit under a
key the config no longer declares. `DECISIONS.md` ("Saves keep field values the
config no longer declares; public reads drop them") says a save keeps those
values and a public read drops them. Only the public-read half is built. Split
from `roadmap/planned/field-rename-command.md` on 2026-10-13, since the command
is `later` and this half fixes data loss on its own: rename a field by mistake,
deploy, and the first save loses the old values, so reverting the config
cannot bring them back.

## What exists

- Public reads drop an undeclared key at every depth, and a block whose type is
  no longer declared (`stripPrivateFields` in
  `packages/astromech/src/content/visibility.ts`).
- A save drops undeclared root keys in two places: `projectToSchema` on a patch
  in `packages/astromech/src/content/prepare-fields.ts`, and again at the start
  of `safeParseFields` in `packages/astromech/src/fields/parse-fields.ts`.
  Nested undeclared keys survive when the client sends them back, because a
  patch replaces an array or container wholesale.

## Prior art

Sanity keeps a field's values in the document after the schema stops declaring
it, and Studio shows them under an "Unknown field" warning (from Sanity's docs).
The rest of the comparison is in `roadmap/planned/field-rename-command.md`.

## The work

- [ ] A save keeps the stored row's undeclared root keys and their values. The
      parse and validators still see only declared fields.
- [ ] `TERMINOLOGY.md` or `apps/docs/content/fields.md` says a rename leaves the
      old values stored and unreachable until a migration moves them.

## Testing

A save after a field is renamed keeps the old key's value; restoring the old
name returns it; a public read never returns it; a full read does.
