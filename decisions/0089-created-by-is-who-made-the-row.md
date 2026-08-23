# 0089 — `createdBy` is who made the row, not who wrote the content

**Date:** 2026-08-24
**Status:** accepted

`entry_versions.createdBy` was hardcoded `null` at both write sites, so the
column was dead and the admin's author line could never render. Populating it
forced a question the column name does not settle on its own.

A version row holds the content being _replaced_: `snapshotVersion` runs before
the update, and `operations/versions/restore.ts` calls it on the state a restore
is about to overwrite. So `createdBy` could reasonably mean either the person who
authored the content in that row, or the person whose write caused the snapshot
to be taken. They are different people whenever anyone edits after anyone else.

**It means who made the row.** `createdBy` now takes `getCurrentUser()?.id`, the
acting user, falling back to `null` outside a request.

Three things decide it:

- **It pairs with `createdAt`**, which is `defaultNow()` — the moment the version
  row was written, not the moment its content was authored. Splitting the pair so
  one field describes the row and the other describes the content would be a
  worse trap than either reading alone.
- **`entry_preview_tokens.createdBy` already means this** in the same module:
  `operations/preview/token.ts` writes `user?.id ?? null` for the issuer.
- **The other reading is not derivable.** Entries record no author at all —
  `entries.createdBy` and `entries.updatedBy` exist as columns and are never
  written (`roadmap/planned/entry-author-columns-are-never-written.md`). There is
  no stored fact about who wrote a version's content to copy forward.

## What this costs

The version write path now carries a live FK to `users`. It could not fail
before, because the value was always `null`; it can now, if an acting identity
ever has an id with no `users` row.

This surfaced immediately in the tests: `tests/_support/mount-router.ts` injects
`testUser = { id: 'u1' }` without inserting a row, and three route tests started
returning 500 on `SQLITE_CONSTRAINT_FOREIGNKEY`. The harness header had stated
the assumption plainly — "Entry inserts never set `createdBy`/`updatedBy` (both
nullable), so no user row is required for the entry flows" — and this record is
what invalidated it. The fix seeds the row where the identity is injected rather
than in `createTestDb`, which would have changed the user count every test sees.

## What it does not decide

**Whether an entry records its author.** That is the larger gap and it stays open
in `roadmap/planned/entry-author-columns-are-never-written.md`. When it lands, it
should follow this rule rather than reopen it: `createdBy` answers who made the
row.
