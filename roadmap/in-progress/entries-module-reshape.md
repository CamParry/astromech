# Entries Module Reshape

Reorganise `entries/` as the **template** for all domains: one storage seam, no repository pattern, operations-per-file, entry/table split. Design + Layer 1 plan: `specs/entries-reshape.md`.

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
- [ ] **Awaiting user review before commit** (uncommitted on `main`)

**Layer 2 — Split** (connects to `unified-admin-pages.md`)

- [ ] Hoist the table kit out of `entries/` (own module); migrate the redirects plugin onto it
- [ ] Collapse entries to one storage — delete `table.ts` divergence, simplify `storage/registry.ts`
- [ ] `capabilities` → `supports`: per-type behaviour/UI flags, no schema effect
- [ ] Composable admin CRUD contract `{ data methods + column shape + supports }`; refactor admin pages to consume it for entries + tables
- [ ] Rename `storage/built-in.ts` → `storage/entries.ts`

**Layer 3 — Adapter** (connects to `planned/additional-database-drivers.md`)

- [ ] Research: cross-dialect ORM landscape; Laravel query-builder teardown; per-entity adapters vs one low-level adapter (see spec §7)
- [ ] `getStorage()` resolver in `database/`, adapter chosen by userland config
- [ ] Postgres adapter
