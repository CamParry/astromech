# 0003 — Data layer: what was locked, and what was rejected

**Date:** 2026-08-03
**Status:** accepted

Supersedes nothing. Records the rationale from `specs/data-layer.md` and
`specs/entries-reshape.md`, both deleted on this date now that the work they
described has shipped (`roadmap/completed/table-definition-system.md`,
`roadmap/completed/data-layer-storage-api.md`, and Layer 1 of
`roadmap/in-progress/entries-module-reshape.md`).

The _what_ is already documented — `apps/docs/data/migrations.md` for users,
`ARCHITECTURE.md` for layout, the `code` skill for the storage pattern. This
file holds only the _why_, and specifically the roads not taken, because those
are what get re-derived otherwise.

## The migration generator is total, or it doesn't exist

Every change expressible in `defineTable` must produce correct DDL. A partial
generator means two worlds — generated and hand-written — and two worlds mean
drift. The alternative on the table was falling back to classic hand-written
migrations entirely; that was the honest fallback, not a partial generator.

Neither Atlas nor drizzle-kit was adopted. The generator is homegrown.

## No rename detection, ever

The descriptor is **state, not history**. A rename and a drop-plus-add are
indistinguishable in a snapshot diff, so a generator that guessed would
sometimes guess wrong and silently destroy a column's data.

A rename therefore reads as drop + add: the add auto-generates, the drop is
destructive and warns. A data-preserving rename is a hand-authored data
migration. This deletes what is drizzle-kit's hardest subsystem and keeps
`db:generate` deterministic and non-interactive — no prompts, so CI can run it
as a drift gate.

## SQLite rebuilds everything, and `defer_foreign_keys` is not optional

The rebuild is ~8 statements derivable from the diff: `PRAGMA
defer_foreign_keys=true` → `BEGIN` → `CREATE __new_x` → `INSERT __new_x SELECT
… FROM x` → `DROP x` → `ALTER __new_x RENAME TO x` → recreate indexes →
`COMMIT`. Inbound FKs survive because the new table reuses the name.

**Do not substitute `PRAGMA foreign_keys=OFF`.** It is ignored inside a
transaction, which is the mechanism behind drizzle's data-loss bug #5782.

## Errors at generate time, warnings for destruction, prompts for nothing

Impossible states are generate-time **errors**, deterministically. The canonical
one: adding a `NOT NULL` column to a possibly-populated table requires a
SQL-literal default, because the rebuild's `INSERT…SELECT` is pure SQL and
cannot call an app-side default.

Destructive ops (drop column, drop table) emit a **loud printed warning** and
proceed. There is no `--force` and no prompt: removing a column from the
descriptor _is_ the intent to drop it. Adding a confirmation step would make the
command non-scriptable to guard against an edit the author already made
deliberately.

## Generation is Node-only; application is Kysely's `Migrator`

Split by environment. Applying migrations is pure SQL through Kysely's
`Migrator`, so it is edge- and D1-safe. Generating them reads and writes an
app's `migrations/` directory and is dev/CI only. No generator binary ever runs
at runtime — which is why `database/generate.ts` must stay out of any barrel a
Worker or browser bundle can reach.

Dialect behaviour keys off a `sqlDialect` tag, never the concrete driver.

## Schema is 100% generated; data is 100% hand-authored; never mixed

Data migrations are hand-authored TS (`up(db: Kysely)`), interleaved into the
one ordered journal by authorship time. The discipline is expand → backfill →
contract. A migration never mixes a generated schema change with a hand-written
data change.

## Plugin tables are open, and the isolation is against accidents only

Table-owning features (forms, analytics, e-commerce) live outside core as
optional installable plugins, so the table mechanism had to be open.

Plugins ship **self-contained journals**: the author generates scoped to the
plugin's own descriptors and commits the migrations into the package; the site
only ever applies them. A site cannot generate for plugin tables because the
plugin's baseline is unknown to it. This is the Rails-engine / Django-app model.

Removal is leave-on-remove + track-installed + warn + an explicit `purge`.

**Threat model:** plugins are trusted, in-process, config-as-code. Type-scoping
and table prefixing prevent accidents, not malice — a raw `` sql`…` `` can still
reach core tables. True isolation would need a separate connection or attached
schema per plugin, and was ruled out of scope.

## Rejected: the `findMany(qb => …)` builder callback

The original lock offered a builder-callback overload alongside the object form,
promising both "decode + return typed objects". That promise is unsound: the
moment a callback joins or projects, there is no longer a single descriptor the
result decodes against.

The justification for accepting that risk was joins. **There are none** — a
sweep for `innerJoin|leftJoin|rightJoin` across core and every plugin returned
zero hits. What actually exceeds the flat DSL is narrower: `count` (made
first-class instead), column projections, one `max('versionNumber')`, and one
offset-based delete (`versions.deleteExcess`). Those go to `query()`, where the
caller owning decode is explicit rather than implied.

If a join ever appears it starts at `query()` too, and only earns a typed seam
once there is more than one.

## Rejected: `populate` of `reference` columns — and never reuse the name

The original lock included `findMany({ populate: ['createdBy'] })` — a batched
app-level resolve of `col.reference` columns, with cross-scope resolution as a
core service. Cut for three independent reasons:

1. **No consumer.** Ten `col.reference` columns exist (`createdBy`, `updatedBy`,
   `userId`, `entryId`, `stagedFor`) and nothing in the codebase resolves any of
   them. `col.reference` is DDL + types only. Shipping a resolver for references
   nobody resolves repeats the mistake `definePermissions` was created to fix — a
   declaration with no reader.
2. **Name collision.** `populate` already means something else here:
   `entries/internal/populate.ts` populates content _relationship fields_ via the
   `relationships` table, which is itself mid-redesign into a derived index
   (`roadmap/completed/relationships-model.md`).
3. **The cross-scope seam is undesigned.** "A plugin's `createdBy → users` is
   resolved by core" states a policy, not a mechanism: a plugin needs a handle to
   core's resolver while remaining unable to address core tables.

When a first consumer appears — admin rendering "created by …" is the likely
one — design it then and name it `resolveRefs` / `withRefs`. **Never
`populate`.**

## Entries: storage is the adapter, and no repository wrapper

From the entries reshape. The storage pattern itself is documented in the `code`
skill; what belongs here is why the repository layer was refused: repositories
pre-flatten the query surface and choke complex logic, and every DB-touching
unit being called "storage" removes a distinction that was never carrying
weight.

Related, and still true: **entry** and **table** are separate internally (own
schema, own storage) and share only the admin surface. The `supports` flags gate
behaviour and UI only — never schema, so toggling one has no migration and no
knock-on. Storage is always full.

The rename `capabilities` → `supports` was locked here for the config axis but
has **not** shipped, and now collides with the storage axis's own `supports`
(`BUILT_IN_SUPPORTS`). See `roadmap/in-progress/entries-module-reshape.md`.
