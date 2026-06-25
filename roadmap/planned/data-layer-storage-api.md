# Data-Layer Storage API (ergonomic Kysely wrapper)

**SHELVED** behind `table-definition-system.md` (Feature 1). Build only once the Kysely base + `defineTable` exist. The ergonomic storage wrapper layered on top of raw Kysely.

**Design spec:** `specs/data-layer.md` §4–§5 (locked via grilling). This file tracks status only.

## Scope

- [ ] `findOne(where)` → `T | null` (unique lookup; replaces `get(id)`)
- [ ] `findMany({ where, orderBy, limit, offset })` → `T[]`, plus `findMany(qb => …)` builder callback
- [ ] `query()` → raw scoped Kysely builder (undecoded escape hatch)
- [ ] `create` / `update(id, patch)` / `delete(id)` (codec choke point)
- [ ] `updateMany(where, patch)` / `deleteMany(where)` (absorb maintenance ops inside the choke point)
- [ ] `upsert(data, { target?, set? })`
- [ ] Flat `where` DSL: `eq/ne/in/notIn/gt/gte/lt/lte/like`, bare value = eq, bare null = IS NULL; `or`/nesting → `query()`
- [ ] `populate(['createdBy'])` — batched app-level resolve of `reference` columns; cross-scope populate is a core service
- [ ] Migrate `createXStorage` internals from raw Kysely to this wrapper

## Locked policy (spec §5)

- No built-in soft-delete in the generic wrapper — `delete` is hard delete; soft-delete stays a domain policy (entries trash).
- Writes are a mandatory choke point so the codec always runs.

## Deferred (separate workstream)

- Relationships / content-field data model — polymorphic relationships table, nested-in-block (`instanceId`-keyed), type-aware `where`, content-relationship populate. See `populate-and-complex-field-data-model.md` + spec §8.
