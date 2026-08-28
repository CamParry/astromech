# Repository DSL Covers Core

Make the flat `where` DSL rich enough that core code stays inside
`createRepository`'s typed methods, and rename the escape hatch so its Kysely
coupling is explicit. The DSL is the stable contract plugins build on; the
hatch carries no compatibility promise.

Today ~10 core call sites drop to `repository.query()` and hand-carry
`selectFrom`/`decodeWith`. Most exist only because the DSL cannot express an
OR. After this work the hatch is rare in core and reserved for genuine raw
SQL: aggregates (`versions.ts` `max(versionNumber)` — deliberately not made a
method, one caller), expression filters (`media` mime buckets), and unusual
plugin queries.

## Decisions made

- **`or` only, no `and`.** Sibling keys already AND together; every known call
  site needs only OR. `(A OR B) AND (C OR D)` has no site today — add `and`
  when one appears. Payload ships both; we grow on demand.
- **`or` takes an array of full `Where<D>` clauses**, OR-ed together and ANDed
  with sibling keys: `{ enabled: true, or: [{ nextRun: { lte: now } }, {
nextRun: null }] }`. Branches are ordinary `Where` objects, so nesting falls
  out of the recursion.
- **`or` is a reserved column name.** The compiler reads every key as a
  column, so a column literally named `or` would be shadowed.
  `createRepository` throws at construction if the table declares one. Gets a
  Reserved-words entry in `DECISIONS.md`.
- **`createMany(rows, { onConflict: 'ignore' })` returns the inserted-row
  count.** Name from Prisma; the option is spelled as the SQL it emits
  (`ON CONFLICT DO NOTHING`), not Prisma's `skipDuplicates`. An empty array is
  a no-op returning 0 (Kysely errors on empty `values`). Rows are grouped by
  column set before insert: Kysely renders a column absent from one row of a
  multi-row insert as a literal `null`, overriding that column's SQL DEFAULT.
- **`pluck(column, params?)` for projections**, typed
  `TableSelect<D>[K][]`, accepting the same `FindManyParams` as `findMany`.
  Established name (Knex `.pluck()`, Rails). Chosen over a `select` param on
  `findMany`, whose return type would turn conditional for one use case.
- **Hard rename `query()` → `kysely()`, `QueryHandle` → `KyselyHandle`, no
  deprecated alias.** Nothing is live; naming the hatch after the engine stops
  the collision with query-as-operation and makes the coupling grep-able, the
  way Payload exposes `payload.db.drizzle` and Strapi `strapi.db.connection`.

## The work

- [x] Top-level `{ or: [...] }` in `Where<D>` per the decisions above, plus
      the reserved-name guard. Frees `users` `list`/`count`, `media` search,
      `cron` `due`/`claim` (which becomes a plain `updateMany`), and the
      preview-token expiry check.
- [x] `createMany` on `Repository`. Frees the `notifications` batch insert and
      `cron` register.
- [x] `pluck` on `Repository`. Frees `users` `ids`/`idsByRole` and the
      preview-token id lookup.
- [x] The `query()` → `kysely()` rename across core.
- [x] Migrate the freed call sites onto the DSL methods.
- [x] The search sites take a `contains` operator instead of escaping at each
      call site. Escaping alone cannot work: Kysely's `like` emits no `ESCAPE`
      clause, so a backslash is a literal character and the escaping is inert.
      `contains` takes plain text and compiles to `LIKE '%…%' ESCAPE '\'`,
      which fixes the pre-existing defect where a search for `100%` matched
      everything starting "100" (`users`, `media`, `tableRepository`).
- [x] `DECISIONS.md`: the DSL is the stable repository contract; `kysely()`
      is deliberately engine-coupled with no compatibility promise, and Kysely
      types cross the public surface only through its return type. Plus the
      Reserved-words entry for `or` and what `pluck`/`onConflict: 'ignore'`
      beat.
- [x] Gate, plus `pnpm run check:node-imports` (the `Repository` type is
      plugin-facing).
