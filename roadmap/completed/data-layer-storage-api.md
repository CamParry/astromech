# Data-Layer Storage API (ergonomic Kysely wrapper)

The ergonomic storage wrapper layered on top of raw Kysely. Unshelved and
**SHIPPED 2026-07-29** (merged to `main`, branch and worktree gone) once
Feature 1 (`table-definition-system.md`) steps 1–7 had landed, which was the
only precondition.

`createStorage(descriptor, db?)` lives at
`packages/astromech/src/database/storage/create-storage.ts`; six storage modules
were migrated onto it. Test baseline 1211 → 1256.

**Everything deliberately left behind is tracked in
`roadmap/planned/storage-layer-follow-ups.md`** — the raw-Kysely sites above
`storage/`, the gated codec collapse, four pre-existing defects the migration
surfaced, and `col.reference` resolution.

**Design spec:** `specs/data-layer.md` §4–§5 (locked via grilling; revised
2026-07-29 by a codebase audit — see "Scope changes" below). This file tracks
status only.

## Scope

- [x] `createStorage(descriptor, db = getDb())` — the generic CRUD object,
      composed **inside** the existing `createXStorage` factories (which keep
      transaction rebinding and the domain vocabulary)
- [x] Flat `where` DSL: `eq/ne/in/notIn/gt/gte/lt/lte/like`, bare value = eq,
      bare null = IS NULL; `or`/nesting → `query()`
- [x] Wrapper-owned value serialization — every predicate value through
      `col.serialize`, each `in` element individually, `like` patterns raw
- [x] `findOne(where)` → `T | null` (unique lookup; replaces `get(id)`)
- [x] `findMany({ where, orderBy, limit, offset })` → `T[]`
- [x] `count(where?)` → `number`
- [x] `query()` → raw scoped Kysely builder (undecoded escape hatch)
- [x] `create` / `update(id, patch)` / `delete(id)` (codec choke point)
- [x] `updateMany(where, patch)` / `deleteMany(where)` (absorb maintenance ops
      inside the choke point)
- [x] `upsert(data, { target?, set? })`
- [x] Migrate `createXStorage` internals from raw Kysely to this wrapper,
      dropping the `as unknown as` cast pairs at every migrated site

## Scope changes (2026-07-29 audit)

Three findings from reading the code rather than the spec:

- **`findMany(qb => …)` builder callback — CUT.** Its decode contract is unsound
  once a callback reshapes, and the joins that justified it do not exist: zero
  `innerJoin|leftJoin|rightJoin` across core and every plugin. The real
  over-the-DSL cases are projections, one `max()`, and one offset delete — all
  `query()` territory.
- **`reference` populate — CUT.** Ten `col.reference` columns exist and nothing
  resolves any of them; `populate` already means content-relationship population
  elsewhere in the codebase; and the cross-scope mechanism was policy, not
  design. Revisit under a different name when a consumer appears.
- **`count(where)` — ADDED.** Not in the original lock. Count-then-rows is the
  most duplicated raw-Kysely pattern in the repo (6 sites).

## Found while migrating

Four pre-existing defects surfaced, each verified to sit outside this
workstream's diff. All are filed in
`roadmap/planned/storage-layer-follow-ups.md` §3: the empty `trashed: true`
read, `localeGroup` minting a UUID against a `defaultUlid` descriptor, a
tx-bound `transaction()` calling `getDb()`, and `built-in.ts`'s private `where`
builder still reading bare `null` as "no filter".

## Locked policy (spec §5)

- No built-in soft-delete in the generic wrapper — `delete` is hard delete;
  soft-delete stays a domain policy (entries trash).
- Writes are a mandatory choke point so the codec always runs.
- Bare `null` in `where` means `IS NULL`. This **changes** `tableStorage`'s
  current behaviour (it reads null as "no filter"); audit its callers.

## Out of scope (deliberate) — now tracked in `planned/storage-layer-follow-ups.md`

- **Raw Kysely above `storage/`** (§1 there). Four services (`media`,
  `notifications`, `settings`, `users`), three transport files, `cron/runner.ts`
  and three `backups`-plugin files query raw — 21 files, four of those domains
  with no storage layer at all. They are also the sites that most wanted
  `count`, which did not exist until this landed.
- **The codec collapse** (§2 there), gated on the above. An earlier draft had
  this workstream delete the string-keyed `decode`/`encode`/`encodePatch` API; a
  call-site census killed that, and also disproved the claim that
  `kyselyTableKey` was deletable — the wrapper and the plugin codec registry
  both need it.

## Deferred (separate workstream)

- Relationships / content-field data model → `relationships-model.md`. **Note
  the direction changed:** the old sketch here (authoritative polymorphic
  relationships table, nested-in-block `instanceId`-keyed rows) is superseded —
  field data is the source of truth and the `relationships` table becomes a
  derived, rebuildable index keyed on field _path_.

    This never applied to `col.reference` columns, which are a different
    mechanism from content relationships — and whose resolution was cut from
    this workstream entirely. It is tracked in
    `planned/storage-layer-follow-ups.md` §4, with the naming constraint that
    matters: it must **not** be called `populate`.
