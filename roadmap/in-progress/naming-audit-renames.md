# Naming audit renames

An outside-in naming audit of `packages/astromech/src` (2026-08-19, judged from
names and signatures against the codebase's own vocabulary profile) found the
vocabulary unusually consistent, with a handful of stragglers against rules the
codebase already keeps. The findings were reviewed and the contested calls
settled; this file holds the agreed work.

Everything here touches only names, file paths, and comments — no behaviour
changes. Several renames touch symbols re-exported from the package root, so
this work is cheapest before the first npm release.

## Decisions settled in review (each needs a `decisions/` record)

1. **Acronyms are title-case with no length exception**: `Ai`, `Ui`, `Url`,
   `Api`, `Http`, `Json`. The two-letter carve-out (`AI`, `UI` staying
   all-caps) was considered and rejected: one rule with no exceptions beats a
   length-dependent rule, and it matches the codebase's dominant existing
   pattern (`Api` ×21, `Http` ×18, `Smtp`, `Mcp`).
2. **The registry probe is `get` and the throwing read is `getOrThrow`**,
   following `Map.prototype.get` (nullable by platform convention) and
   Kysely's `executeTakeFirst` / `executeTakeFirstOrThrow`. TypeScript types
   carry nullability; a throwing wrapper documents the throw in its comment.
   Supersedes `decisions/0069-the-build-sequence-is-flat-and-the-probe-is-maybeget.md`.
3. **`storage` means file storage; the data-access layer is `repository`.**
   The word previously named both the blob/file subsystem and the per-domain
   persistence layer. "Storage" is universally read as file storage, so the
   file side keeps it and the data-access side (the 41-use majority) renames
   to `repository` (TypeORM / Spring / DDD's term for per-entity CRUD).
   `store` was rejected as too close to the surviving `storage`;
   `persistence` as awkward in type names. Needs a `TERMINOLOGY.md` entry.
4. **`get` stays the async CRUD read verb** (`get` returns one, `query`
   returns many). `load`/`fetch` for I/O was considered and rejected: the
   CRUD verb set is consistent and deliberate.
5. **`validate(schema, data)` stays as is** — both the shape and the `data`
   parameter name.

## The work

One branch, one commit per workstream.

### WS1 — registry primitive: `get` / `getOrThrow`

- [ ] In `packages/astromech/src/utilities/registry.ts` (both `createRegistry`
      and `createKeyedRegistry`): rename `maybeGet` → `get` (nullable) and the
      current throwing `get` → `getOrThrow`.
- [ ] Wrapper functions across the subsystem registries keep their bare `get*`
      names. Nullable ones (`getEmailDriver`, `getSchedulerDriver`,
      `getAiConfig`, `getMethodManifest`, `getModel`) now read naturally
      against the primitive; throwing ones (`getDb`, `getStorageDriver`,
      `getConfig`, …) state the throw in their doc comment.
- [ ] `packages/astromech/src/database/driver-registry.ts` exports both
      variants, so it takes the suffix: `getDatabaseDriver` becomes the
      nullable read, the throwing read becomes `getDatabaseDriverOrThrow`,
      and `maybeGetDatabaseDriver` is deleted. Update call sites.
- [ ] Write the `decisions/` record superseding 0069.

### WS2 — acronym casing sweep

- [ ] `AI` → `Ai` (~16 identifiers): `AIConfig`, `setAIConfig`, `getAIConfig`,
      `buildAIConfig`, `WrappedAIConfig`, `formatAIContextMessage`,
      `AIContextStore`, `createAIContextStore`, `AIContextProvider`,
      `useAIContext`, `useAIContextItems`, `AIContextReadout`,
      `AIContextKind`, `AIContextReference`, `AIContextItem`.
- [ ] `URL` → `Url` in Astromech-owned identifiers only. Platform globals
      (`URL`, `URLSearchParams`) are untouched.
- [ ] `UI` → `Ui`: `UIProvider` and any siblings.
- [ ] Write the `decisions/` record (the "no length exception" choice is the
      part a future contributor would re-litigate).

### WS3 — `storage` → `repository` for the data-access layer

The file/blob side is untouched: top-level `storage/`, `StorageDriver`, and
the `r2`/`s3`/`filesystem` drivers keep their names.

- [ ] `packages/astromech/src/database/storage/` → `database/repository/`;
      `create-storage.ts` → `create-repository.ts`; `Storage<D>` →
      `Repository<D>`; `createStorage` → `createRepository`.
- [ ] `packages/astromech/src/entries/storage/` → `entries/repository/`, with
      the symbol sweep: `EntryStorage` → `EntryRepository`,
      `getEntryStorage`/`setEntryStorage` → `getEntryRepository`/
      `setEntryRepository`, `hasEntryStorageOverride`,
      `resetEntryStorageOverrides` and friends renamed to match.
- [ ] Per-domain modules: `media/storage.ts`, `users/storage.ts`,
      `settings/storage.ts`, `notifications/storage.ts`, `cron/storage.ts`,
      `plugins/runtime/plugin-tracking-storage.ts` → `repository` naming,
      including their `create*Storage` factories and `*Storage` types.
- [ ] While inside `entries/repository/`: `EntryRecord` → `EntryRow` (the
      house suffix for persisted shapes — `RelationshipRow`, `CronRow`,
      `NotificationRow`), keeping the pairing with `EntryWrite` coherent.
- [ ] Add the `TERMINOLOGY.md` entries (`repository`, and sharpen `storage`)
      and the `decisions/` record with the rejected alternatives.

### WS4 — component filename casing

Thirteen PascalCase component files sit in a kebab-case tree (70 kebab-case
component siblings). Rename files only; exported component names stay
PascalCase.

- [ ] `AuthCard.tsx` → `auth-card.tsx`
- [ ] `DeleteEntryModal.tsx` → `delete-entry-modal.tsx`
- [ ] `PublishPanel.tsx` → `publish-panel.tsx`
- [ ] `FieldTreeForm.tsx` → `field-tree-form.tsx`
- [ ] `MediaCard.tsx` → `media-card.tsx`
- [ ] `MediaDetailModal.tsx` → `media-detail-modal.tsx`
- [ ] `MediaRow.tsx` → `media-row.tsx`
- [ ] `ComponentErrorBoundary.tsx` → `component-error-boundary.tsx`
- [ ] `ComponentPageView.tsx` → `component-page-view.tsx`
- [ ] `SettingsPageForm.tsx` → `settings-page-form.tsx`
- [ ] `PluginSlot.tsx` → `plugin-slot.tsx`
- [ ] `LocaleSwitcher.tsx` → `locale-switcher.tsx`
- [ ] `Brand.tsx` → `logo.tsx` (its only export is `Logo`)

### WS5 — smaller renames

- [ ] `builtInRole` → `permissionsForBuiltInRole` in
      `packages/astromech/src/permissions/index.ts`. It returns
      `Permission[]`, not a role; the new name matches the existing
      `permissionsFor` phrasing. Re-exported from the package root.
- [ ] `ConfirmOutcome` → `ConfirmationResult` in
      `packages/astromech/src/policies/confirmation.ts` (`result` ×12,
      `outcome` ×1). The `confirm` verb itself stays — it is a real domain
      concept, not a synonym for `validate`.
- [ ] `checkRichTextDocument` → `validateRichText` in
      `packages/astromech/src/fields/rich-text/validate.ts` (`validate` ×23,
      `check` ×4) — unless it returns a bare boolean, in which case `check`
      stays. The `document` noun stays either way (ProseMirror vocabulary).
- [ ] `UseEntryFormReturn` → `UseEntryFormResult` in
      `packages/astromech/src/admin/hooks/use-entry-form.ts` (sibling hooks
      all say `Result`).
- [ ] `fields/pipeline.ts` → `fields/parse-fields.ts`. Its exports are
      `parseFields`, `ParsedFields`, `assertNoFieldErrors`; "pipeline" is a
      colliding metaphor. Keep the old name only if the file genuinely
      composes an ordered multi-stage transform.
- [ ] `transport/http/routes/http-routes.shared.ts` → `http-routes.ts`. The
      `.shared.ts` suffix elsewhere means isomorphic client/server modules;
      this file's "shared" means shared between routers.
- [ ] The four `methods.ts` files whose only export is `{domain}Contract`
      (`media`, `notifications`, `settings`, `users`) → `contract.ts`, so the
      filename and the export use the same word.
- [ ] `v` → `value` on the six exported coercers in
      `packages/astromech/src/fields/built-in-rules.ts` (`coerceEmail`,
      `coerceUrl`, `coerceNumber`, `coerceDate`, `coerceKeyValue`,
      `isJsonValue`).
- [ ] Normalize the internal delete helpers: `entries/operations/delete.ts`
      exports both `deleteOne` and `deleteEntry` — two compounds for one
      concept; pick one shape. The service surface already says bare
      `delete(params)` (`delete` is only reserved as a bare binding, not as a
      method name), so this is internal-only.

### WS6 — directory moves out of the layer-word buckets

- [ ] Lift `utilities/registry.ts` (the DI primitive every subsystem's
      registry depends on) to its own top-level module beside the composition
      root.
- [ ] `utilities/image-drivers.ts` and `utilities/image-widths.ts` → under
      `media/`.
- [ ] `utilities/entry-capabilities.ts` and `utilities/entry-type-ids.ts` →
      beside the entry code.
- [ ] `admin/lib/settings-page-save.ts` → under a settings subject;
      dissolve `admin/lib/`.
- [ ] `admin/support/ui-instance-guard.ts` → into `admin/context` or an
      admin UI subject; dissolve `admin/support/`.
- [ ] `entries/utils/url.shared.ts` → `entries/entry-url.shared.ts`;
      dissolve `entries/utils/`.
- [ ] What remains in `utilities/` (`bytes`, `strings`, `dates`, `locale`,
      `options`, `values-equal`) is the accepted miscellany bucket. Update
      `ARCHITECTURE.md` where the moves change the map.

## Explicitly not doing

- **`maybeGet*` wrapper renames** — dissolved by WS1: the primitive's `get`
  is now the nullable read, so the wrappers' existing names become honest.
- **`get` → `load`/`fetch` on async reads** — rejected; `get` is the CRUD
  read verb (decision 4).
- **`validate(schema, data)` changes** — kept as is (decision 5). The
  triplication of the helper itself is tracked in
  `roadmap/planned/three-identical-validate-helpers.md`.
- **Renaming the blob side to `blob/`** — inverted by decision 3; the file
  side keeps `storage`.
- **`types/` break-up** — the shared-contracts barrel stays; co-location is
  a per-contract judgement for later work, not a sweep.
