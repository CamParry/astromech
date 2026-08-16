# HTTP route defects

Eight defects found while writing the route test net for
`roadmap/completed/manifest-driven-transports.md`. Each is pinned by a test
asserting **current** behaviour, so fixing one means changing its test — that is
deliberate. A test net that encoded the fixes would not have been a net.

They are listed together because they were found together, not because they are
one piece of work. Two are worth doing on their own; the rest are cheapest as
part of the route conversion, which is noted per item.

## Access control

- [x] **`routes/entry-types.ts` has no permission check at all.** Any
      authenticated caller gets the full field configuration of every entry type
      — field names, types, validation rules, relationship targets. Both handlers
      in the file are affected. This is the one to fix first and on its own; it
      does not need the conversion. Fixed 2026-08-15: both handlers gate on
      `entry:{type}:read`; the list filters to the readable types, the single
      read 403s before the existence check.
- [x] **`POST /entries/query` checks type existence before permission**, unlike
      the other 29 entries routes, so an unauthorised caller can enumerate which
      entry types exist by reading 404 against 403. The inversion is visible in
      `tests/transport/http/routes/entries-permissions.test.ts`, which asserts
      both orderings. Fixed 2026-08-15: the loop checks permission first, and
      the test now asserts the same 403-before-404 ordering as every other
      route.

## Contract not honoured

- [x] **`versions` and `restoreVersion` ignore their declared
      `requires: 'versioning'`.** An unversioned type gets `200 []` where every
      other capability-gated route answers 409. A table-driven handler reading
      `requires` from the manifest fixes this by construction, so it is cheapest
      inside step 2 of the conversion. Fixed 2026-08-15 without waiting for the
      conversion: both rows now use the checked `entryAccess()`, and with no
      caller left the `'unchecked'` escape hatch was deleted from
      `entryAccess`/`entryPrecondition` entirely. The 200-empty-list pin became
      a 409 pin, and `restoreVersion` gained the unversioned-type test it never
      had.
- [x] **`GET /entry-types/:type` 404s a plugin entry type.** It reads
      `Astromech.config.entries[type]` directly instead of `resolveEntryType`, so
      `widgets/widget` has no metadata endpoint even though
      `/entries/widgets%2Fwidget` serves fine. Fixed 2026-08-15: the handler
      resolves through `resolveEntryType`, so root and plugin-qualified ids
      serve alike; the list route stays root-only on purpose.

## Error handling

- [x] **`POST /:type/:id/staged`'s catch-all turns every non-`StagedEntryExistsError`
      throw into a 500**, bypassing `onError`. A `ValidationError` raised on that
      path renders as an internal error rather than the 422 it renders as
      everywhere else. Fixed 2026-08-15: the catch keeps only the 409 envelope
      (with `details.stagedId`) and re-raises everything else to `onError`.
      Nothing pinned the 500, so the fix added a test rather than changing one —
      injected, because `createStaged` copies stored values and runs no field
      pipeline, so no config can provoke the error naturally.
- [x] **`?dir=` anything but `asc`/`desc` 400s from the OpenAPI route schema**,
      which makes `parseQueryParams`' own `dir === 'asc' ? 'asc' : 'desc'`
      fallback unreachable on `GET /:type`. Dead code behind a validator, and
      worth deleting with the rest of `parseQueryParams` in step 2 rather than
      separately. Fixed 2026-08-15 (`parseQueryParams` was already gone; the
      fallback had survived in `listArgs`). The dead ternary is now
      `?? 'desc'`, and the same fallback on `GET /media` and `GET /users` —
      which had no `dir` enum at all, so `?dir=sideways` silently sorted
      descending — got the same `z.enum` and now 400s too, per 0029's
      reject-don't-coerce reasoning. That also put their query strings in the
      OpenAPI document.

## Data

- [x] **`role_slug` defaults to `'admin'`** in
      `apps/demo/migrations/0000_baseline.ts`, so a user created without an
      explicit role counts toward the last-admin guard and cannot be deleted
      while it is the only one. A demo-side migration, but the default is worth
      checking against what core's own baseline does. Fixed 2026-08-15/16 in
      two steps. First the DDL default became `'editor'`. Then the default
      moved out of the DDL into code: `DEFAULT_ROLE_SLUG` next to
      `BUILT_IN_ROLES`, supplied by better-auth `user.additionalFields`
      (`input: false`, so a signup body can never name its own role — its
      value is discarded, not rejected) and by the create schema's zod
      default; the column is now `NOT NULL` with no default, so a write path
      that forgets the role fails loudly. Tightening `roleSlug` to a plain
      `string` in the Kysely types surfaced that `scripts/seed.ts` was
      creating two admins while printing "(admin, editor)". A signup test
      proves the better-auth path writes the default against the defaultless
      column.

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
