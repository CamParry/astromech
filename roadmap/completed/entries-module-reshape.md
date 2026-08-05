# Entries Module Reshape

Reorganise `entries/` as the **template** for all domains: one storage seam, no repository pattern, operations-per-file, entry/table split. Design rationale: `decisions/0003-data-layer-locks-and-rejected-options.md`; the storage pattern itself is in the `code` skill. The in-flight spec was deleted once Layer 1 shipped and Layers 2–3 were re-scoped below.

**Complete 2026-08-06.** Layer 1 shipped as a single reshape; Layer 2 finished as
two bullets satisfied elsewhere and two closed on their merits without a code
change; Layer 3 was dropped as superseded. `entries/` is the shape the other
domains are read against, and the two `EntryStorage` implementations —
`storage/built-in.ts` and `storage/table.ts` — are the seam that made it one.

**Layer 1 — Reshape** (relocation + decomposition + de-repository; zero behaviour change)

- [x] Decompose `service.ts` → `operations/**` (file per op, grouped: `staging/ preview/ versions/`) + `internal/**` (validation, slug, relationships, supports, populate, + records/type-config/hooks/bulk/diff/preview); `service.ts` is now a thin assembler. _(No `bulk/` dir — per §6 bulk dispatch stays inline in each op; status wrappers live in `operations/status.ts`, `incomingRelationships` in `operations/relationships.ts`.)_
- [x] Dissolve `entries/data/` — `populate.ts` → `internal/`, `versions.ts` → `storage/versions.ts`
- [x] Drop the repository pattern: `*Repository` classes → `createXStorage(db)` factories (versions, preview-tokens, relationships); document the storage pattern (done in `code` skill)
- [x] Move `database/repositories/preview-tokens.ts` → `entries/storage/preview-tokens.ts` (entries-specific)
- [x] Move `database/repositories/relationships.ts` → `database/storage/relationships.ts` (shared); update `users`/`media` call sites; remove `database/repositories/`
- [x] `BuiltInEntryStorage` class → factory `createBuiltInEntryStorage` (behaviour preserved; kept `built-in.ts` name this layer)
- [x] Move `entries/url.ts` → `entries/utils/url.ts` (dep-cruiser allowlist updated)
- [x] Jobs (`scheduled-publish`, `trash-purge`) call storage (new `storage/maintenance.ts`) — raw drizzle removed
- [x] Verify: `grep -rn "getDb\|drizzle\|entriesTable" entries/` hits only `entries/storage/**` + `entries/schema.ts`; full suite (816) + lint + typecheck + dep-cruiser green
- [x] Reviewed, committed (`fa87a57`) and merged to `main`

**Layer 2 — Split** (connects to `completed/unified-admin-pages.md`)

Re-audited against the codebase 2026-08-03. Two bullets turned out to be already
satisfied — by the data-layer and plugin work rather than by this layer — and the
two that remained needed re-deciding rather than executing, because the ground
they stood on moved. Both were re-decided on 2026-08-06 and closed without a
code change.

- [x] Migrate the redirects plugin onto the table kit — done elsewhere:
      `packages/plugins/redirects/src/entries/redirect.ts` declares
      `storage: tableStorage(redirectsTable)` and manages the type through the
      standard entry UI with no bespoke admin surface
- [x] Composable admin CRUD contract `{ data methods + column shape + supports }`
      for entries + tables — satisfied by a different route, so nothing further
      is owed. There is no separate "tables" admin surface to unify: a
      table-backed type _is_ an entry type. `admin/rendering/resolve.ts` plus
      `adminColumns` and `capabilities` already drive one set of pages for both,
      which is what redirects renders through
- [x] **`table.ts` is not divergence — KEPT 2026-08-06.** The original bullet was
      "collapse entries to one storage — delete `table.ts` divergence, simplify
      `storage/registry.ts`", and its premise inverted. `entries/storage/table.ts`
      owns no SQL, no `where` DSL and no row decoding: every read and write goes
      through `createStorage` (`database/storage/create-storage.ts`), which owns
      all three. What it adds is the mapping from a `Table` to the `EntryStorage`
      contract, and a `supports: []` declaration that switches the entry chrome
      off. That is a second implementation of one interface, sitting beside
      `storage/built-in.ts`, the first. `TERMINOLOGY.md` already describes it that
      way, and `decisions/0012-driver-not-adapter.md` is why the word is
      "adapter". Deleting it would mean folding a table-shaped backend into the
      built-in one and reintroducing the branching this layer removed
- [x] **Hoist the table kit out of `entries/` — WON'T DO 2026-08-06.** The kit
      already left, by a different route than this bullet imagined: `defineTable`,
      `definePluginTable`, `createStorage`, `codec.ts`, `table-snapshot.ts` and
      the migration emitters are all in `database/`. What remains under
      `entries/storage/` is the entry _adapter_ for tables, not the kit. Moving it
      to `database/` would put one `EntryStorage` implementation in a module that
      knows nothing about entries, and separate it from the other one it is read
      against
- [x] **`capabilities` → `supports` — DROPPED 2026-08-04.** The naming review
      (`roadmap/completed/naming-pass.md` §G) resolved it: the collision was the code
      reporting that there are two axes, not drift. `supports` is what a storage
      backend _can_ do; `capabilities` is what a type has _turned on_;
      `resolveEntryCapabilities(cfg, storageSupports)` converts one to the other,
      so merging them loses information. Both names stay. What was actually wrong
      is that each of the two files is named for the other's axis —
      `storage/capabilities.ts` exports `BUILT_IN_SUPPORTS`,
      `internal/supports.ts` exports `assertCapability`. §G1 dissolves
      `internal/supports.ts` into `internal/type-config.ts` +
      `storage/registry.ts`; tracked on `roadmap/completed/naming-pass.md`
- [x] **`storage/built-in.ts` → `storage/entries.ts` — WON'T DO 2026-08-04.**
      `entries.ts` inside `entries/storage/` collides with the `entries` table
      descriptor (`entries/schema.ts:17`), and "built-in storage" is already the
      consistent term across `TERMINOLOGY.md`, `BUILT_IN_SUPPORTS` and
      `createBuiltInEntryStorage`. Recorded in
      `roadmap/completed/naming-pass.md` §G so a later pass doesn't reopen it

**Layer 3 — Adapter: DROPPED 2026-08-03, superseded.**

The spec's §7 framed this as open research (per-entity adapters vs one low-level
adapter) under constraints that no longer exist — "drizzle's dialect differences
make the abstraction leaky" and "drizzle table defs in `schema.ts` are
dialect-specific". Drizzle is gone. `completed/table-definition-system.md`
answered §7 by choosing the one-low-level-adapter reading and building it:
Kysely + `createStorage` + `defineTable` descriptors with per-dialect DDL emit in
`@astromech/schema-engine`. The `getStorage()` resolver shipped as two seams —
`getEntryStorage(type)` (`entries/storage/registry.ts`) and
`DatabaseDriver.createDialect()`, chosen from userland config. The Postgres
adapter is tracked in `planned/additional-database-drivers.md`, which already
covers the driver, the descriptor/DDL dialect variants and the per-dialect
migration pipeline. Nothing is left here.
