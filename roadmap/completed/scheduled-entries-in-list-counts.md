# Scheduled entries in list counts

A public `entries.query` pushes `status: 'published'` into the repository's
SQL, but not `publishedAt <= now`. A published entry scheduled for the future
is counted in `total` and fetched into the page, then dropped by
`applyVisibility` after the fetch
(`packages/astromech/src/entries/methods/query.ts`). So `total` and `pages`
count entries a visitor cannot see, and a page can come back with fewer rows
than `limit` while later pages still have rows.

Split out of `roadmap/planned/field-value-query-indexing.md` on 2026-09-15,
where it was the prerequisite that section shares with relationships.

## The work

- [x] The entries-table repository takes the time a public list is read at and
      adds `publishedAt IS NULL OR publishedAt <= now` to the predicate that
      both the rows and the count share.
- [x] `entries.query` passes the same `now` it gives `applyVisibility`, so the
      two cannot disagree, and the comment describing the miscount goes.
- [x] A test: a public list with a future-scheduled published entry reports a
      `total` and `pages` that exclude it, and a full page holds `limit` rows.

The time goes to the repository as `ListParams.publishedAsOf`, and
`entries.query` is the only paginated public list that needed it.
