# Naming pass

One pass over the core's naming: the service/method/API/client vocabulary, the
`policies/` and `entries/` modules, the table exports, module and concept names,
the public subpaths, and the docs that describe all of it.

**Landed 2026-08-04** — items 1–20 of the plan's order table, merged to `main` as
seven commits on `refactor/naming-pass`. Every batch was verified at the full
gate and at the exact test baseline (2465 core / 32 authoring / 86
schema-engine); the merge was verified again on `main` with `build`,
`check:config`, `check:node-imports`, `db:generate` and a demo boot.

Items 21–22 (§D and §A5) followed on `refactor/public-subpaths`, at the same
baseline.

**Plan:** `specs/naming-pass.md`, now trimmed to the unshipped sections only.
The headline decisions are recorded in
`decisions/0009-service-method-client-vocabulary.md` and
`decisions/0015-public-subpaths-mirror-the-source.md`.

## Shipped

### Service vocabulary (§A) — `e74cf1d`

- [x] `*Api` types → `*Service`; `AstromechApiError` keeps its name
- [x] One export pattern across six domains: `<domain>Service`
- [x] `types/api.ts` → `services.ts`, `types/services.ts` → `methods.ts`
- [x] `<domain>/descriptors.ts` → `<domain>/methods.ts` (5 files;
      `fields/descriptors.ts` is the field-type registry and stays)

### `policies/` (§B) — `ec7f2f9`, `21cd357`

- [x] `principal` → `role`
- [x] `withPermissions` → `permissionsFor`, moved to `permissions/permissions-for.ts`
- [x] `decide` → `allowedFor`
- [x] `ScopedService` → `ScopedServices`, file → `scoped-services.ts`. The
      factory went plural with it: `scopedService(): ScopedServices` was the
      exact mismatch the item exists to remove
- [x] `GateOutcome` → `ConfirmOutcome`, `confirm-gate.ts` → `confirmation.ts`
- [x] `Surface*` → `filterMethods`/`MethodFilter`/`FilterResult`,
      `tool-surface.ts` → `method-filter.ts`, `cli/surface-args.ts` →
      `filter-args.ts`

### Modules and concepts (§C) — `db6d42f`

- [x] `kernel/` → `boot/`. Public `astromech/astro` unchanged; only the dist
      path moved
- [x] `context/` → `request-context/`. `src/admin/context/` keeps the bare name
      — it holds the genuine React contexts, which is what made the rule true

### Table exports (§F) — `9bbd93a`

- [x] All ten core `defineTable` exports carry a `Table` suffix; nine aliases
      deleted. `defineTable`'s first argument was verified byte-identical
      against the branch point, and `db:generate` reports no changes
- [x] Convention recorded in the `code` skill, `TERMINOLOGY.md` and the plugin
      authoring docs

### `entries/` (§G) — `fbc9bc4`, `17f5df9`

- [x] `internal/supports.ts` dissolved into `internal/type-config.ts`. **Not**
      `storage/registry.ts` as designed — that file is deliberately config-free
      and these helpers read `virtual:astromech/config`
- [x] `incomingRelations` → `incomingRelationships`, including the manifest
      method name and the HTTP route segment
- [x] `relationshipsRepo` → `relationships`
- [x] `type-registry.ts` → `type-ids.ts`
- [x] `entryHooksActive` → `hasEntryHooks`, `entrySnapshot` →
      `loadEntrySnapshot`, `internal/diff.ts` → `deep-equal.ts`,
      `internal/validation.ts` → `parse.ts` (`validate` → `parseWith`)
- [x] `force` → `permanent`, on the parameter **and** on `EntryDeleteContext`,
      the plugin-facing hook payload. Nothing subscribes yet

### Public subpaths (§D) — `4502e51`

- [x] `astromech/db/{schema,d1}` → `astromech/database/{schema,d1}`
- [x] `astromech/images/{sharp,cloudflare}` →
      `astromech/media/image/{sharp,cloudflare}`
- [x] `astromech/Image` → `astromech/media/Image`. The capital stays — it names
      an Astro component
- [x] `astromech/ui` deliberately keeps its name against the rule; its source is
      `src/admin/components/`
- [x] The `src/exports/` barrels follow the subpath, `/` replaced by `-`

### Client export names (§A5) — `5f1556d`

- [x] `astromech/fetch` exports `astromechClient`; `astromech/local` keeps
      `Astromech`. Both keep their default export, so
      `import Astromech from 'astromech/fetch'` is unaffected
- [x] 21 admin import sites plus 4 test files, including three `vi.mock` factory
      keys that would have returned `undefined` silently

### Docs (§E)

- [x] `ARCHITECTURE.md`: the layer model and directory map both listed a
      top-level `client/` that does not exist — the fetch client is a leaf
      inside the HTTP transport
- [x] Project `CLAUDE.md` matched to the global naming rules' 2026-08-04 split
- [x] `decisions/0009-service-method-client-vocabulary.md`

## Not done

All three were added after the order table was written, so none has a place in
it:

- [ ] **§H `fields/`** — the layout-field/presentational vocabulary, dropping
      "chrome", `formatFieldPath` → `formatInstancePath`, splitting
      `helpers.ts`. Never in the order table
- [ ] **§I definitions are objects** — `defineX` returns an `X`;
      `TableDescriptor` → `Table`, `FieldDefinition` → `Field` and the rest.
      Never in the order table, and it has an internal ordering dependency
- [ ] **§J `resource`** — a superordinate noun for entries/media/users/settings,
      and the `document-validators.ts` → `resource-validators.ts` that follows.
      Never in the order table

## Follow-ups this pass surfaced

- [ ] **"Surface" survives on the wire.** `method-filter.ts` emits
      `read-only surface: method mutates state`, `excluded by surface policy`
      and `not in the included surface`; all three ship in
      `astromech methods --json` and are asserted in tests. Changing them is a
      behaviour change, not a rename, so they were left. The word is now dead in
      the code and alive in the output
- [ ] **`force` survives in two more places.** The HTTP route segment
      `DELETE /entries/:type/:id/force` and an admin prop chain through
      `DeleteEntryModal`. `TERMINOLOGY.md` disowns the word. The CLI's
      `--force` flag is a genuinely different concept and keeps its name
- [ ] **`MediaUsage` is documented as "the media mirror of
      `IncomingRelationship`" while sharing no name with it.** Belongs to a
      media pass
- [x] **`decisions/` had two `0007` files** — fixed by the documentation pass:
      the media-browser record became `0010`, and `decisions/README.md` now
      carries an index so a collision is visible when the next entry is written
