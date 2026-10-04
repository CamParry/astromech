---
milestone: 1.0
---

# Editorial defects

Found on 2026-10-03 while planning `roadmap/planned/drafts.md`.

- **The redirects plugin records a redirect for any slug change.** Its
  `entry:afterUpdate` hook (`packages/plugins/redirects/src/hooks/slug-change.ts`)
  checks neither status nor staging, so renaming an unpublished entry, or a
  staged change, records a 301 from a path that was never live. With autosave,
  every half-typed slug would become one.
- **The redirects plugin records the wrong path in other locales.** It builds
  `from` from the `url` template alone (`resolveEntryPath` in
  `packages/astromech/src/entries/entry-url.ts`), with no locale prefix, so a
  slug change in a non-default locale redirects from a path that never
  existed. `roadmap/planned/ordered-and-nested-entries.md` replaces the hook
  with a path-change event that carries the locale.
- **Setting a status through `update` needs only `update`.** `schedule` and
  `unpublish` need `publish`, but `update` with `status: 'scheduled'` or
  `'unpublished'` passes with `update`
  (`packages/astromech/src/entries/internal/access.ts`).
- **Globals publish with `update` alone.** `globals.update` accepts `status`
  and `publishedAt` (`packages/astromech/src/globals/schema.ts`) and checks
  only `update` (`packages/astromech/src/globals/methods/update.ts`); the tests
  cover only the dedicated status routes.
- **The admin ignores `publish`.** The status select offers every status to
  everyone (`packages/admin/src/components/entries/publish-panel.tsx`), the
  new-entry page always shows Publish, and every save sends `status`, so a user
  without `publish` gets a 403 saving a published entry.
- **`maxVersions` is never applied**, and **a staged write takes a version that
  is deleted when the staged change is merged or discarded**. Both are fixed by
  `roadmap/planned/history.md`; listed here so they are not fixed twice.

The class: a side effect or a permission tied to the write rather than to what
became live.

## The work

- [ ] The redirects plugin records a redirect only when a published entry's
      live slug changes (on publish, once drafts land).
- [ ] Redirect paths include the locale prefix.
- [ ] A status in `update` needs `publish`, as the status methods do, for
      entries and globals.
- [ ] The admin offers status changes and Publish only with `publish`.
- [ ] Tests for both.

## Progress

Branch `editorial-defects`, two commits, not merged and, as of 2026-10-04, not
pushed: it exists only in the local checkout it was written in. Nothing above
is ticked until it merges.

- The server commit makes a status or publish date set through `update`,
  `create` or `duplicate` need `publish`. Its review found one gap that blocks
  merging: a new locale copies the source's status, so a user without
  `publish` can put a translation live. Decided: a new locale starts
  unpublished. The review's smaller fixes go in the same change.
- The admin commit sends `status` only when the user changed it, and shows a
  user without `publish` a read-only status control and no Publish button. It
  has not been reviewed.

Left before merging: the new-locale fix, the two redirects items, a review of
the admin commit, the status UI checked in a browser, and `pnpm run verify`.
Main has moved on since the branch forked: merge it in first, expecting
conflicts in `packages/astromech/src/entries/methods/query.ts` (`noStore()` and
the shared list filters) and `packages/admin/src/hooks/entries.ts` (the counts
query's invalidation).
