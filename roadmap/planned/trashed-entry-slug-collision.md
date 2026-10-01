# A trashed entry's slug blocks a new entry

Creating an entry whose generated slug matches a trashed entry's fails with
`SQLITE_CONSTRAINT: UNIQUE constraint failed: entry_content.type,
entry_content.locale, entry_content.slug`. Found by the shuffled test runs in
[test-suite-review](../in-progress/test-suite-review.md), stage 2b.

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
- **Trashing frees the slug.** The index (or the trashed row's slug) stops
  counting trashed entries, and `restore`
  (`packages/astromech/src/entries/methods/restore.ts`) re-slugs an entry
  whose slug was taken while it was in the trash. WordPress does the second
  part by appending `__trashed` to the slug on trash. Check what Payload's
  trash does before choosing.

## The work

- [ ] Write a failing test for the reproduction above.
- [ ] Decide which side changes, and record why in `DECISIONS.md`.
- [ ] Make `uniqueSlug`, the index and `restore` agree, with a migration if
      the index changes.
