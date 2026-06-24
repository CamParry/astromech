# Entries Module Reshape — organisation, storage pattern, entry/table split

**Status:** Designed (discussion 2026-06-21); not yet implemented. Design locked for Layer 1; Layers 2–3 sketched and will evolve.
**Touches (Layer 1):** `packages/astromech/src/entries/**`, `packages/astromech/src/database/{repositories→storage}/**`, `packages/astromech/src/utilities/`.
**Related roadmap:** `in-progress/unified-admin-pages.md` (the Layer 2 admin contract), `planned/additional-database-drivers.md` (the Layer 3 adapter), `in-progress/populate-and-complex-field-data-model.md` (populate lives here).
**Related memories:** `project_modular_architecture.md`, `project_forward_versioning.md`, `tableStorage omits type`, `dep-cruiser self-import → src`.

> This is the **testing ground** for module organisation. Whatever lands here becomes the template applied to `media`, `users`, `settings`. Get it right here first.

---

## 1. Problem

`entries/` is the most complex domain and the least consistently organised. Concrete issues found (2026-06-21 audit):

- **No single DB seam.** The service calls `storage.*` for CRUD but instantiates `RelationshipsRepository` directly 11+ times, reaches `PreviewTokensRepository`/`getDb()` directly, jobs hit raw drizzle, and `populate.ts` runs its own `.select()`. Four paths to the database.
- **Three styles for one role.** Classes (`BuiltInEntryStorage`, `VersionsRepository`, `RelationshipsRepository`), object-literals (the `trash`/`versions`/`staging`/`translatable` capability groups _inside_ built-in), and bare functions / object-literal API (`service.ts`).
- **God file.** `service.ts` is 1458 lines mixing validation, slug, relationships, versioning, staging, preview, visibility orchestration and bulk dispatch.
- **`data/` is a junk drawer.** `populate.ts` (a utility that queries directly) and `versions.ts` (a repository) share neither a seam nor a style.
- **Entries does double duty.** The `EntryStorage` interface serves both the rich built-in content unit _and_ arbitrary plugin tables (redirects via `tableStorage`). This conflation is the root cause of the capability-divergence machinery (`supports: []`, `if (!storage.trash)` guards, per-type capability config + boot validation).

All code is AI-generated; these are the organisational failure modes AI accumulates. Fixing the template makes the whole codebase more navigable for both humans and agents.

---

## 2. Terminology (locked)

| Term          | Meaning                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **entry**     | The built-in content unit. Fixed schema. _Always_ has the full feature set (statuses, slug, versions, staging, trash, translation, preview, relationships).                                                                        |
| **table**     | A plugin-defined custom table (redirects, logs). **Not an entry.** Lives in its own world (own schema/storage), conforms only to the admin UI contract.                                                                            |
| **storage**   | The data-access seam for a domain. _Storage is the adapter_ — operations call storage; storage talks to the DB. **No repository pattern anywhere** — every DB-touching unit is "storage".                                          |
| **operation** | One use-case function (`create`, `query`, `mergeStaged`, …). The unit `operations/` is split by. Operations wrap storage and compose `internal/` helpers.                                                                          |
| **internal**  | Entries-private domain logic shared across operations (validation, slug, relationships orchestration, supports gating, populate). Named `internal/` — **not** `policy/` — to avoid collision with the top-level `policies/` layer. |
| **supports**  | Per-entry-type feature flags (renamed from "capabilities" — that read like permissions). Gate _behaviour + UI only_, **never schema**. Toggling has no migration/knock-on; storage is always full.                                 |
| **adapter**   | A per-database implementation of storage, selected by userland config and resolved via `getStorage()`. Lives in `database/`. **Layer 3 — deferred.**                                                                               |

### Naming clash to be aware of

The top-level `storage/` directory is **media binary storage** (filesystem/R2 drivers), a _different_ concept from the data-access "storage" pattern in this spec. Domain DB-access modules live in `<domain>/storage/`; binary blob storage stays top-level `storage/`. (Future cleanup candidate: rename binary `storage/` → `blob-storage/`. Out of scope here; noted in backlog.)

---

## 3. Locked decisions

1. **Pluggable storage stays.** It is real and exercised (redirects runs on `tableStorage`, per-type dispatch, capability gating). Fat-service-no-abstraction is rejected.
2. **Storage interface used directly. No repository wrapper.** Repos pre-flatten the query surface and choke complex logic.
3. **Entries-local concerns = storage** (versions, preview-tokens). **Cross-cutting subsystems = shared storage the service composes** (relationships is `entry|user|media`-wide → `database/storage/`).
4. **Service never touches raw drizzle.** It only calls storage (entries' own or a shared subsystem's).
5. **Entry and table are separate internally** (own schema/storage). They share **only** the admin UI, via a conformance contract. Plugins live in their own world — no `supports`, no entry machinery.
6. **Entries = one storage** (full schema, always present). `supports` flags gate behaviour + UI only.
7. **Rename `capabilities` → `supports`** everywhere. _(Layer 2 — that machinery is reworked there.)_
8. **Decompose by operations** — file per operation, cohesive clusters in subdirs.
9. **`storage` is the adapter; operations wrap storage.** No extra layer between.
10. **Adapter seam in `database/`**, chosen by userland config, resolved via `getStorage()`. _(Layer 3 — deferred.)_
11. **Helpers hoisted** — generic → `utilities/`; entries-specific cross-file → `entries/utils/`. `url.ts` is a utility.
12. **Storage module style:** factory function `createXStorage(db) => ({ … })` returning a typed object implementing the contract. **No classes.** (Closes over the db handle; keeps the per-adapter future open; matches "functions by default, factories for adapters".)
13. **Operation/internal style:** plain named async functions. `service.ts` is a thin assembler wiring operations into the public `EntriesApi`.

---

## 4. Target architecture

```
operations (use-case functions)         ← the public EntriesApi, assembled in service.ts
   ↓ wrap
storage (IS the adapter; one impl now, per-DB later)   ← entries' own + composed shared subsystems
   ↓
DB (drizzle today; behind getStorage() adapter in Layer 3)

shared cross-cutting:  database/storage/relationships  (entry|user|media)

table kit (Layer 2): hoisted entirely out of entries; conforms to the admin UI contract
admin UI: one composable CRUD surface, driven by { data methods + column shape + supports }
```

### Target `entries/` tree (end state of Layer 1)

```
entries/
  index.ts              public exports
  service.ts            thin assembler — wires operations into EntriesApi
  operations/
    query.ts get.ts create.ts update.ts delete.ts trash.ts restore.ts duplicate.ts
    bulk/      update.ts trash.ts delete.ts schedule.ts
    staging/   create.ts get.ts merge.ts delete.ts
    preview/   token.ts read.ts
    versions/  list.ts restore.ts
  internal/             entries-private domain logic shared across operations
    validation.ts slug.ts relationships.ts supports.ts populate.ts
  visibility.ts         shape/audience projection (entries policy; stays at root for now)
  storage/
    types.ts            EntryStorage contract
    built-in.ts         the entry-row storage (factory fn; → renamed `entries.ts` in Layer 2)
    table.ts            plugin custom-table storage (→ hoisted out in Layer 2)
    registry.ts         per-type storage dispatch (→ simplified in Layer 2)
    capabilities.ts     (→ becomes supports.ts in Layer 2)
    versions.ts         version storage (moved from data/versions.ts)
    preview-tokens.ts   preview-token storage (moved from database/repositories/)
  utils/
    url.ts              entry URL/path resolution
  schema.ts errors.ts type-registry.ts
  jobs/
    index.ts scheduled-publish.ts trash-purge.ts   ← call storage, NO raw drizzle

database/
  storage/
    relationships.ts    shared (was repositories/relationships.ts)
  registry.ts schema.ts drivers/ …                 ← getStorage()/adapter lands here (Layer 3)
```

`entries/data/` is **dissolved**. `database/repositories/` is **removed**.

---

## 5. Sequencing

**Layer 1 — Reshape (this spec's actionable scope).** Pure relocation + decomposition + de-repository. Single DB. **Zero behaviour change** — existing tests stay green throughout.

**Layer 2 — Split.** Hoist the table kit entirely out of `entries/`; migrate the redirects plugin onto it; collapse entries to one storage (delete `table.ts` divergence, `registry.ts` simplifies); `capabilities` → `supports` as behaviour/UI flags; build the composable admin contract `{ data methods + column shape + supports }` and refactor admin pages to consume it for both entries and tables. Connects to `roadmap/in-progress/unified-admin-pages.md`.

**Layer 3 — Adapter.** Design `getStorage()` + the adapter granularity; add Postgres. **Opens with research** (see §7). Connects to `roadmap/planned/additional-database-drivers.md`.

---

## 6. Layer 1 — file-by-file move map

> No behaviour change. Decompose, relocate, rename `*Repository`→storage, normalise style (§3.12–13). Run the full `entries` + `storage` test suites after each cluster; they must stay green. Lint + typecheck must pass (no `--no-verify`).

| Current                                                               | Target                                                                                  | Action                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entries/service.ts` (1458L)                                          | `entries/operations/**` + `entries/internal/**` + `entries/service.ts` (thin assembler) | **Decompose.** Each public method → an operation file (grouped per tree). Extract shared helpers (`validate`, slug, relationships orchestration, supports checks) → `internal/`. `service.ts` imports operations and assembles the `EntriesApi` object. |
| `entries/data/populate.ts`                                            | `entries/internal/populate.ts`                                                          | Move. It must take storage/db via parameter as today; relationships access goes through the shared relationship storage (§ below), not a direct `new RelationshipsRepository`.                                                                          |
| `entries/data/versions.ts` (`VersionsRepository` class)               | `entries/storage/versions.ts` (`createVersionStorage(db)` factory)                      | Move + drop "Repository" + class→factory.                                                                                                                                                                                                               |
| `entries/data/` (dir)                                                 | —                                                                                       | **Delete** once emptied.                                                                                                                                                                                                                                |
| `database/repositories/preview-tokens.ts` (`PreviewTokensRepository`) | `entries/storage/preview-tokens.ts` (`createPreviewTokenStorage(db)`)                   | Move (entries-specific) + drop "Repository" + class→factory.                                                                                                                                                                                            |
| `database/repositories/relationships.ts` (`RelationshipsRepository`)  | `database/storage/relationships.ts` (`createRelationshipStorage(db)`)                   | Move (shared cross-domain) + drop "Repository" + class→factory. Update `users/service.ts` + `media/service.ts` call sites.                                                                                                                              |
| `database/repositories/` (dir)                                        | —                                                                                       | **Delete** once emptied.                                                                                                                                                                                                                                |
| `entries/storage/built-in.ts` (`BuiltInEntryStorage` class)           | `entries/storage/built-in.ts` (factory fn)                                              | Class→factory; preserve capability-group behaviour exactly (collapse happens in Layer 2). Keep filename `built-in.ts` this layer.                                                                                                                       |
| `entries/url.ts`                                                      | `entries/utils/url.ts`                                                                  | Move.                                                                                                                                                                                                                                                   |
| `entries/jobs/scheduled-publish.ts`                                   | same                                                                                    | Replace raw `db.select/update(entriesTable)` with calls through entry storage.                                                                                                                                                                          |
| `entries/jobs/trash-purge.ts`                                         | same                                                                                    | Replace raw `db.delete(entriesTable)` with calls through entry storage (emptyTrash-style).                                                                                                                                                              |
| `entries/{schema,errors,type-registry,index}.ts`                      | unchanged location                                                                      | No move. (`index.ts` re-export surface updated to new internal paths.)                                                                                                                                                                                  |
| `entries/{visibility,scoped-entries,plugin-access}.ts`                | unchanged location                                                                      | No move this layer.                                                                                                                                                                                                                                     |

### Service → operations split (target operation set)

`query, get, create, update, delete, trash, restore, duplicate` (flat) · `bulk/{update,trash,delete,schedule}` · `staging/{create,get,merge,delete}` · `preview/{token,read}` · `versions/{list,restore}`. Bulk dispatch (`id: string | string[]`) and transaction wrapping stay in the relevant operation, using `storage.transaction`.

### The single rule that ends the inconsistency

> **No file under `entries/` (service, operations, internal, jobs) imports `getDb` or builds a drizzle query.** It calls entry storage, or a shared subsystem's storage (relationships). Storage modules are the _only_ place drizzle appears.

This is the verification checklist for Layer 1: `grep -rn "getDb\|drizzle\|entriesTable" entries/` should hit **only** `entries/storage/**` and `entries/schema.ts`.

---

## 7. Deferred decisions (Layer 3 — research first)

The hard one: **"storage is the adapter" has two readings, costing very differently for Postgres.**

- **(a) Per-entity adapters** (Payload model): each storage module gets a per-DB impl. Reliable, but every storage module is rewritten per database, and the duplication tax extends to _plugin authors_ (each plugin table must support each adapter).
- **(b) One low-level DB adapter** all storage written against once (the Laravel/Eloquent feel). Far less per-DB code, but drizzle's dialect differences make the abstraction leaky.

Research to open Layer 3:

- ORM landscape for a unified cross-dialect builder (drizzle/Kysely momentum; Prisma DSL friction); whether any actually delivers it.
- **Teardown of Laravel's query builder / Eloquent dialect abstraction** — closest prior art.
- Build-our-own-mini-ORM for the _known_ internal shapes (viable because non-table schemas are fixed) vs. per-entity adapters.

**Constraint honoured now:** Layer 1 keeps each storage module's DB-specifics isolated (factory over a db handle) so either model stays open. Note: drizzle table defs in `schema.ts` are dialect-specific (`sqlite-core`), which is part of the Layer 3 problem — left untouched in Layer 1.

---

## 8. The admin UI contract (Layer 2 — sketch)

The de-dup point between entries and tables. A data source conforms to:

```ts
type AdminDataSource = {
    list(params): Promise<{ rows; total }>; // pagination = params in, total out
    get(id): Promise<Row | null>;
    create(input): Promise<Row>;
    update(id, input): Promise<Row>;
    delete(id): Promise<void>;
    fields: FieldSchema; // columns, types, searchable/sortable flags
    supports: SupportFlag[]; // [] for plain tables → UI hides all entry chrome
};
```

`supports` is the single UI-layer switch that makes one composable CRUD surface serve both worlds — entries fill it from config, tables leave it empty. Search/sort/filter are list params, honoured only for fields the schema declares. The framework ships a **table kit** (honest successor to `tableStorage`, living in the table world, not `entries/`) so plugins get a conforming source without hand-rolling six methods. Name `AdminDataSource` is provisional.
