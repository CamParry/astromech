# Data-Layer Storage API (ergonomic Kysely wrapper)

The ergonomic storage wrapper layered on top of raw Kysely. **Unshelved
2026-07-29** — Feature 1 (`table-definition-system.md`) steps 1–7 have all
landed, which was the only precondition.

**Design spec:** `specs/data-layer.md` §4–§5 (locked via grilling; revised
2026-07-29 by a codebase audit — see "Scope changes" below). This file tracks
status only.

## Scope

- [ ] `createTableStorage(descriptor, db = getDb())` — the generic CRUD object,
      composed **inside** the existing `createXStorage` factories (which keep
      transaction rebinding and the domain vocabulary)
- [ ] Flat `where` DSL: `eq/ne/in/notIn/gt/gte/lt/lte/like`, bare value = eq,
      bare null = IS NULL; `or`/nesting → `query()`
- [ ] Wrapper-owned value serialization — every predicate value through
      `col.serialize`, each `in` element individually, `like` patterns raw
- [ ] `findOne(where)` → `T | null` (unique lookup; replaces `get(id)`)
- [ ] `findMany({ where, orderBy, limit, offset })` → `T[]`
- [ ] `count(where?)` → `number`
- [ ] `query()` → raw scoped Kysely builder (undecoded escape hatch)
- [ ] `create` / `update(id, patch)` / `delete(id)` (codec choke point)
- [ ] `updateMany(where, patch)` / `deleteMany(where)` (absorb maintenance ops
      inside the choke point)
- [ ] `upsert(data, { target?, set? })`
- [ ] Migrate `createXStorage` internals from raw Kysely to this wrapper
- [ ] Collapse the codec: string-keyed `decode`/`encode`/`encodePatch` shrink to
      the 4 legacy better-auth tables; delete `DESCRIPTORS` + `kyselyTableKey`
      and the `as unknown as` casts at every call site

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

## Locked policy (spec §5)

- No built-in soft-delete in the generic wrapper — `delete` is hard delete;
  soft-delete stays a domain policy (entries trash).
- Writes are a mandatory choke point so the codec always runs.
- Bare `null` in `where` means `IS NULL`. This **changes** `tableStorage`'s
  current behaviour (it reads null as "no filter"); audit its callers.

## Out of scope (deliberate)

- **Raw Kysely above `storage/`.** Four services (`media`, `notifications`,
  `settings`, `users`), three transport files, `cron/runner.ts` and three
  `backups`-plugin files query raw — 21 files, four of those domains with no
  storage layer at all. Migrating them is a separate follow-up; they are also
  the sites that most want `count`, which does not exist until this lands.

## Deferred (separate workstream)

- Relationships / content-field data model → `relationships-model.md`. **Note
  the direction changed:** the old sketch here (authoritative polymorphic
  relationships table, nested-in-block `instanceId`-keyed rows) is superseded —
  field data is the source of truth and the `relationships` table becomes a
  derived, rebuildable index keyed on field _path_.

    This never applied to `col.reference` columns, which are a different
    mechanism from content relationships — and whose resolution is now cut from
    this workstream entirely (see above).
