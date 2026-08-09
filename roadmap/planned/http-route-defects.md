# HTTP route defects

Eight defects found while writing the route test net for
`roadmap/planned/manifest-driven-transports.md`. Each is pinned by a test
asserting **current** behaviour, so fixing one means changing its test — that is
deliberate. A test net that encoded the fixes would not have been a net.

They are listed together because they were found together, not because they are
one piece of work. Two are worth doing on their own; the rest are cheapest as
part of the route conversion, which is noted per item.

## Access control

- [ ] **`routes/entry-types.ts` has no permission check at all.** Any
      authenticated caller gets the full field configuration of every entry type
      — field names, types, validation rules, relationship targets. Both handlers
      in the file are affected. This is the one to fix first and on its own; it
      does not need the conversion.
- [ ] **`POST /entries/query` checks type existence before permission**, unlike
      the other 29 entries routes, so an unauthorised caller can enumerate which
      entry types exist by reading 404 against 403. The inversion is visible in
      `tests/transport/http/routes/entries-permissions.test.ts`, which asserts
      both orderings.

## Contract not honoured

- [ ] **`versions` and `restoreVersion` ignore their declared
      `requires: 'versioning'`.** An unversioned type gets `200 []` where every
      other capability-gated route answers 409. A table-driven handler reading
      `requires` from the manifest fixes this by construction, so it is cheapest
      inside step 2 of the conversion.
- [ ] **`GET /entry-types/:type` 404s a plugin entry type.** It reads
      `Astromech.config.entries[type]` directly instead of `resolveEntryType`, so
      `widgets/widget` has no metadata endpoint even though
      `/entries/widgets%2Fwidget` serves fine.

## Error handling

- [ ] **`POST /:type/:id/staged`'s catch-all turns every non-`StagedEntryExistsError`
      throw into a 500**, bypassing `onError`. A `ValidationError` raised on that
      path renders as an internal error rather than the 422 it renders as
      everywhere else.
- [ ] **`?dir=` anything but `asc`/`desc` 400s from the OpenAPI route schema**,
      which makes `parseQueryParams`' own `dir === 'asc' ? 'asc' : 'desc'`
      fallback unreachable on `GET /:type`. Dead code behind a validator, and
      worth deleting with the rest of `parseQueryParams` in step 2 rather than
      separately.

## Data

- [ ] **`role_slug` defaults to `'admin'`** in
      `apps/demo/migrations/0000_baseline.ts`, so a user created without an
      explicit role counts toward the last-admin guard and cannot be deleted
      while it is the only one. A demo-side migration, but the default is worth
      checking against what core's own baseline does.

## Already resolved by the audit

- **`SORTABLE_FIELDS` in `routes/entries.ts` is a byte-identical copy** of the
  set in `entries/storage/built-in.ts`. Not a defect in itself — it means step 2
  can delete the route copy without risk, because storage already guards the
  order-by column.

## Notes / caveats

- All eight are pre-existing. None was introduced by
  `roadmap/completed/domain-shape-convergence.md` or by the test net.
- The tests that pin them live in
  `packages/astromech/tests/transport/http/routes/`, added alongside the step 0
  audit.
