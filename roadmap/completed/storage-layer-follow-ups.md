# Storage-layer follow-ups

Everything deliberately left behind by the data-layer storage API workstream
(`completed/data-layer-storage-api.md`, merged 2026-07-29), plus the pre-existing
defects that surfaced while migrating onto `createStorage`.

**SHIPPED 2026-07-30** on `feat/storage-layer-follow-ups`, five commits. Test
baseline 1360 → 1416.

`col.reference` resolution was split out on 2026-07-30 — it was the one section
here with no consumer to serve, so it did not belong in a shipped file. See
`roadmap/planned/col-reference-resolution.md`.

## 1. Migrate raw Kysely above `storage/` ✅

Four domains queried the database straight from their service and had no storage
layer at all. Each now has a `createXStorage(db?)` beside its service, composed
on `createStorage`, resolving the db per call and taking an optional tx handle as
its rebinding point — the entries pattern.

- [x] `media` / `notifications` / `settings` / `users` storage factories
- [x] The transport, cron and backups queries moved behind them
- [x] Hand-rolled count-then-rows pairs replaced by `count(where)` (kept
      concurrent — the point was to stop hand-writing the count, not to
      serialize it)

**`users` is hand-rolled, deliberately, and this is not a defect to fix.**
(Both halves of that were later overturned — `users` has a descriptor, and the
format is ISO text, not seconds. See
`DECISIONS.md`.) It is
one of the four better-auth tables in `LEGACY_CODECS`: seconds-INTEGER
timestamps, uuid ids, no `defineTable` descriptor. `createStorage` is
descriptor-driven, so it cannot wrap it. It gets the same method vocabulary with
raw Kysely inside. The goal being served was "no raw Kysely above `storage/`",
not "everything goes through `createStorage`". Giving it a real descriptor is a
separate piece of work — see `backlog.md`.

Three sites stayed raw, each for a stated reason: the `accounts` insert in
`users-create.ts` (a second better-auth table, not the users domain's to own),
`plugin-purge.ts`'s `sql` template (surrounded by sibling raw DDL, and routing
one of them through storage while the others stay raw reads worse), and
`entries/storage/related-records.ts`'s `users` lookup (`domain-no-peer-imports`
bars entries from importing users storage — verified by running depcruise against
the import, not by eye).

Beyond the brief: `settings.get` loaded **every** settings row to read one key and
its per-locale variant. It reads the two keys it needs.

## 2. Collapse the codec ✅

- [x] `DESCRIPTORS` deleted, along with the descriptor-table string-keyed paths
      and `lookupDescriptor` (with the fusion gone, its name promised a global
      lookup it no longer performed)
- [x] `LEGACY_CODECS` kept — better-auth owns that format regardless
- [x] `kyselyTableKey` kept. It is **not** legacy: both `createStorage` and the
      plugin codec registry call it. An earlier draft had it deleted; a call-site
      census disproved that.

**The precondition cost 51 sites, not the ~30 estimated here, and `src` was not
already clear** — `entries/storage/built-in.ts` still held four. The find that
mattered: both seed scripts reach the codec through `astromech/db/schema` and are
in **no tsconfig**, so after the deletion they would have failed _silently_ —
`encode` falls through to `stripUndefined`, and `Date` objects would have gone
into ISO-TEXT columns unconverted, with no error anywhere. They were converted and
typechecked against source through a scratch project, because nothing in the gate
reaches them. `astromech/db/schema` now also exports the descriptor forms, which
it had to for the seeds to encode a row we own.

`decode`/`encode`/`encodePatch` kept their names: they still serve two live
consumers (the better-auth tables, and plugin tables addressed by name), so an
auth-specific rename would be wrong. The header comment described three tiers and
now describes the two that remain, and records that `DESCRIPTORS` existed and why
it is gone so nobody re-adds it.

Zero `as unknown as` casts were removed. The "double-cast" claim in the original
filing was wrong: `decodeWith<T>(desc, row: T): T` is typed _identically_ to
`decode<T>(table, row: T): T`, and `encodeWith` returns a bare
`Record<string, unknown>` exactly as `encode` did. The `*With` form takes a
descriptor as an _argument_; it is not descriptor-_typed_. Deleting those casts
needs `encodeWith` to derive its return type from the descriptor — filed in
`backlog.md`.

## 3. Pre-existing defects ✅

None were caused by the migration — each was verified to sit outside its diff —
but all were found by it.

- [x] **`trashed: true` reads returned nothing through the HTTP query endpoint.**
      The filed hypothesis was right: `buildListWhere` was innocent. Public shape
      forces `status: 'published'` into the query and then the visibility filter
      drops every trashed row, while `full` is only ever set by an explicit flag
      and never derived from authentication. An empty list was indistinguishable
      from "no trashed entries", so the incoherent combination now throws,
      mapped to 400 on all three routes that funnel into `entries.query`. The
      admin trash view was never affected — its client injects `full: true`.
- [x] **`localeGroup` minted with `crypto.randomUUID()`** at four sites despite
      `defaultUlid`. None of the three operations used the value before the
      insert, so all four let the descriptor mint it. The key is _omitted_ rather
      than passed as `undefined`, which `exactOptionalPropertyTypes` requires.
- [x] **A tx-bound storage's `transaction()` called `getDb()`.** The described
      effect was wrong: Kysely refuses nesting outright (`trx.transaction()`
      throws), so it could never have "reused the bound one". The real effect was
      writes escaping the outer rollback by landing on the base connection. Now
      it fails loudly instead. `tableStorage` needed no fix — it reads its handle
      back out of `query()`. Savepoint-based nesting remains undecided; see
      `backlog.md`.
- [x] **`built-in.ts`'s fixed-key `where` builder read a bare `null` as "no
      filter".** Aligned with the shared DSL. Every caller was audited first:
      none passed `null` meaning unfiltered.
- [x] **`npm run db:seed` only worked from the repo root.** The default URL
      resolves from `import.meta.url`, so it works from either cwd and the root
      script stays a thin delegator.

## Also shipped here

`createStorage` was internal-only — no export subpath, zero plugin usage — so a
plugin author had the descriptor vocabulary and the row codec but not the wrapper
that consumes them. It is now on the root `astromech` export beside `decodeWith`/
`encodeWith`/`TableDescriptor`, with all eight public types, and the backups
plugin's three copies of `db(ctx)` + `TABLE` collapsed onto one
`createBackupRunsStorage`. Documented in `apps/docs/plugins/authoring.md`.

**Under-exporting one of those types surfaces as TS2742 in a plugin's dts build,
not as an error in core** — so `npm run build` is the check that matters when the
export set changes, not `typecheck`.

`media.upload` minted its id with `crypto.randomUUID()` — the same defect class
as `localeGroup`, but not listed above. Unlike `localeGroup` it cannot be left to
the descriptor default: the object-storage key derives from the id and the bytes
are written before the row exists, so it is minted explicitly. Newly uploaded
media only; nothing validates a media id's shape.
