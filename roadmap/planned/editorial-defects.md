# Editorial defects

Found on 2026-10-03 while planning `roadmap/planned/drafts.md`.

- **The redirects plugin records a redirect for any slug change.** Its
  `entry:afterUpdate` hook (`packages/plugins/redirects/src/hooks/slug-change.ts`)
  checks neither status nor staging, so renaming an unpublished entry, or a
  staged change, records a 301 from a path that was never live. With autosave,
  every half-typed slug would become one.
- **Setting a status through `update` needs only `update`.** `schedule` and
  `unpublish` need `publish`, but `update` with `status: 'scheduled'` or
  `'unpublished'` passes with `update`
  (`packages/astromech/src/entries/internal/access.ts`).
- **`maxVersions` is never applied**, and **a staged write takes a version that
  is deleted when the staged change is merged or discarded**. Both are fixed by
  `roadmap/planned/history.md`; listed here so they are not fixed twice.

The class: a side effect or a permission tied to the write rather than to what
became live.

## The work

- [ ] The redirects plugin records a redirect only when a published entry's
      live slug changes (on publish, once drafts land).
- [ ] A status in `update` needs `publish`, as the status methods do.
- [ ] Tests for both.
