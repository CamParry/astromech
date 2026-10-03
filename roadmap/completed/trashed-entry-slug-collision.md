# A trashed entry's slug blocks a new entry

Creating an entry whose generated slug matches a trashed entry's fails with
`SQLITE_CONSTRAINT: UNIQUE constraint failed: entry_content.type,
entry_content.locale, entry_content.slug`. Found by the shuffled test runs in
[test-suite-review](../completed/test-suite-review.md), stage 2b.

To reproduce: create a `post` titled "Same", trash it, then create another
`post` titled "Same".

## The defect

`uniqueSlug` in `packages/astromech/src/entries/repository/entries-table.ts`
treats a trashed entry's slug as free: it skips rows whose entry has a
`deletedAt`. The unique index `entry_content_type_locale_slug_unique` in
`packages/astromech/src/entries/tables.ts` covers trashed rows too (its only
condition is `staged_for IS NULL`). So the generator offers a slug the
database refuses.

## The decision

The two sides disagree on whether a trashed entry keeps its slug. Pick one and
make the other match:

- **A trashed entry keeps its slug.** `uniqueSlug` stops skipping trashed rows,
  so the new entry gets `same-1`. Restoring never collides. The URL of a
  trashed entry stays reserved until the trash is emptied.
- **Trashing frees the slug** (chosen). The index (or the trashed row's slug) stops
  counting trashed entries, and `restore`
  (`packages/astromech/src/entries/methods/restore.ts`) re-slugs an entry
  whose slug was taken while it was in the trash. WordPress does the second
  part by appending `__trashed` to the slug on trash. Check what Payload's
  trash does before choosing.

## The work

- [x] Write a failing test for the reproduction above.
- [x] Decide which side changes, and record why in `DECISIONS.md`. Decided
      2026-10-02: trashing frees the slug, and restoring unpublishes
      (`DECISIONS.md`, "Trashing frees an entry's slug, and restoring
      unpublishes").
- [x] Add a trashed flag to `entry_content`, set and cleared for every locale
      in the same transaction as `deletedAt`, and add it to
      `entry_content_type_locale_slug_unique`'s `WHERE`. Needs a migration
      and a hand edit to the Cloudflare baseline. The column is `trashed`; a
      content row inserted into a trashed entry takes it from `deletedAt`, and
      `apps/demo/migrations/0009_entry-content-trashed.ts` marks the rows of
      entries already in the trash.
- [x] `uniqueSlug` reads the flag instead of joining `entries`.
- [x] `restore` takes `uniqueSlug(slug, excludeId)` for each locale whose slug
      is now taken, and sets `unpublished` through `updateEntryBatch`, so the
      update hooks fire and `publishedAt` follows the one rule. Check what the
      admin's restore action shows when a slug changed. The updates commit one
      by one while the entry is still in the trash, so a restore is not
      atomic, but nothing goes live until the final transaction takes the
      batch out of the trash; a batch keeps two restored entries from taking
      one slug. The admin said
      only "restored", and now names the new slug. The redirects plugin's
      slug-change hook skips a trashed entry, which would otherwise have
      redirected the old path, now another entry's, to the restored one.
