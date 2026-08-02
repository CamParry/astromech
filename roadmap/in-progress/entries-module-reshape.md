# Entries Module Reshape

Reorganise `entries/` as the **template** for all domains: one storage seam, no repository pattern, operations-per-file, entry/table split. Design rationale: `decisions/0003-data-layer-locks-and-rejected-options.md`; the storage pattern itself is in the `code` skill. (`specs/entries-reshape.md` was deleted once Layer 1 shipped and Layers 2–3 were re-scoped below.)

**Layer 1 — Reshape** (relocation + decomposition + de-repository; zero behaviour change)

- [x] Decompose `service.ts` → `operations/**` (file per op, grouped: `staging/ preview/ versions/`) + `internal/**` (validation, slug, relationships, supports, populate, + records/type-config/hooks/bulk/diff/preview); `service.ts` is now a thin assembler. _(No `bulk/` dir — per §6 bulk dispatch stays inline in each op; status wrappers live in `operations/status.ts`, `incomingRelations` in `operations/relations.ts`.)_
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
two that remain need re-deciding rather than executing, because the ground they
stood on moved.

- [x] Migrate the redirects plugin onto the table kit — done elsewhere:
      `packages/plugins/redirects/src/entries/redirect.ts` declares
      `storage: tableStorage(redirectsTable)` and manages the type through the
      standard entry UI with no bespoke admin surface
- [x] Composable admin CRUD contract `{ data methods + column shape + supports }`
      for entries + tables — satisfied by a different route, so nothing further
      is owed. There is no separate "tables" admin surface to unify: a
      table-backed type _is_ an entry type. `admin/definitions/derive.ts` plus
      `adminColumns` and `capabilities` already drive one set of pages for both,
      which is what redirects renders through
- [ ] **Decide, then act: is `table.ts` still divergence?** The original bullet
      was "collapse entries to one storage — delete `table.ts` divergence,
      simplify `storage/registry.ts`". The premise has inverted. `tableStorage`
      is now a documented _adapter_ over `createStorage` that declares
      `supports: []` — a legitimate second implementation of one contract, not a
      fork. Deleting it is no longer obviously right; re-decide before building
- [ ] Hoist the table kit out of `entries/` into its own module. The migration
      half is done (above); only the file move is open, and it is worth less now
      that `tableStorage` reads as an `EntryStorage` adapter sitting next to the
      other one
- [ ] **`capabilities` → `supports` — blocked on a name collision.** The storage
      layer already uses `supports` for its own axis (`BUILT_IN_SUPPORTS`,
      `entries/storage/capabilities.ts`, `supports: []` on `tableStorage`), while
      `EntryTypeConfig.capabilities` is the config axis. The rename as written
      would give one word two meanings. Needs a third name, or dropping
- [ ] Rename `storage/built-in.ts` → `storage/entries.ts` (cosmetic)

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
