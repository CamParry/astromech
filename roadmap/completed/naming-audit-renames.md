# Naming audit renames

An outside-in naming audit of `packages/astromech/src` (2026-08-19, judged from
names and signatures against the codebase's own vocabulary profile) found the
vocabulary unusually consistent, with a handful of stragglers against rules the
codebase already keeps. The findings were reviewed and the contested calls
settled; this file holds the agreed work.

Everything here touches only names, file paths, and comments — no behaviour
changes. Several renames touch symbols re-exported from the package root, so
this work is cheapest before the first npm release.

**All six workstreams have shipped.** WS3 (`storage` → `repository`) was the
last: it reversed a rule written in `.claude/skills/code/SKILL.md`,
`decisions/0003` and `decisions/0009`, so it was settled as a data-layer
question first, in `decisions/0075`. This file is a record of what landed.

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
3. **Shipped as WS3, recorded in `decisions/0075`.** `storage` means file
   storage; the data-access layer is `repository`.
   The word previously named both the blob/file subsystem and the per-domain
   persistence layer. "Storage" is universally read as file storage, so the
   file side keeps it and the data-access side (the 41-use majority) renames
   to `repository` (TypeORM / Spring / DDD's term for per-entity CRUD).
   `store` was rejected as too close to the surviving `storage`;
   `persistence` as awkward in type names.
4. **`get` stays the async CRUD read verb** (`get` returns one, `query`
   returns many). `load`/`fetch` for I/O was considered and rejected: the
   CRUD verb set is consistent and deliberate.
5. **`validate(schema, data)` stays as is** — both the shape and the `data`
   parameter name.

## The work

One branch, one commit per workstream.

### WS1 — registry primitive: `get` / `getOrThrow`

- [x] In `packages/astromech/src/registry.ts` (both `createRegistry`
      and `createKeyedRegistry`): rename `maybeGet` → `get` (nullable) and the
      current throwing `get` → `getOrThrow`.
- [x] Wrapper functions across the subsystem registries keep their bare `get*`
      names. Nullable ones (`getEmailDriver`, `getSchedulerDriver`,
      `getAiConfig`, `getMethodManifest`, `getImageConfig`) now read naturally
      against the primitive; throwing ones (`getDb`, `getStorageDriver`,
      `getConfig`, …) state the throw in their doc comment.
- [x] `packages/astromech/src/database/driver-registry.ts` exports both
      variants, so it takes the suffix: `getDatabaseDriver` becomes the
      nullable read, the throwing read becomes `getDatabaseDriverOrThrow`,
      and `maybeGetDatabaseDriver` is deleted. Update call sites.
- [x] Write the `decisions/` record superseding 0069 —
      `decisions/0072-the-registry-probe-is-get.md`. `getModel` does not
      exist; the nullable wrapper the audit missed is `getImageConfig`.

### WS2 — acronym casing sweep

- [x] `AI` → `Ai` (18 identifiers): the `AiConfig` set (`AiConfig`,
      `WrappedAiConfig`, `setAiConfig`, `getAiConfig`, `buildAiConfig`) and the
      `AiContext*` family (`AiContextItem`, `AiContextReference`,
      `AiContextKind`, `AiContextStore`, `AiContextStoreContext`,
      `createAiContextStore`, `AiContextProvider`, `AiContextProviderProps`,
      `useAiContext`, `useAiContextItems`, `useAiContextStore`,
      `AiContextReadout`, `formatAiContextMessage`).
- [x] `URL` → `Url`: nothing to do. Every Astromech-owned identifier was
      already `Url` (`coerceUrl`, `getSignedUploadUrl`, `publicUrl`). The
      all-caps hits are platform globals (`URL`, `URLSearchParams`), Node's
      `fileURLToPath`, better-auth's `baseURL` config key, and SCREAMING_SNAKE
      env vars.
- [x] `UI` → `Ui`: `UiProvider`, `UiProviderProps`, `UiContext`,
      `UiContextValue`, `useUi`. Declared in `admin/context/ui.tsx`, consumed
      by the three layout components. Not on the public surface.
- [x] Write the `decisions/` record (the "no length exception" choice is the
      part a future contributor would re-litigate) —
      `decisions/0073-acronyms-are-title-case.md`.

### WS3 — `storage` → `repository` for the data-access layer

Shipped. The data-layer question it was parked on is settled in
`decisions/0075` (the DB-access layer is `repository`, `storage` means
file/blob only), which supersedes `decisions/0003` on the naming point.

The file/blob side is untouched: top-level `storage/`, `StorageDriver`, and
the `r2`/`s3`/`filesystem` drivers keep their names.

- [x] `packages/astromech/src/database/storage/` → `database/repository/`;
      `create-storage.ts` → `create-repository.ts`; `Storage<D>` →
      `Repository<D>`; `createStorage` → `createRepository`.
- [x] `packages/astromech/src/entries/storage/` → `entries/repository/`, with
      the symbol sweep: `EntryStorage` → `EntryRepository`,
      `getEntryStorage`/`setEntryStorage` → `getEntryRepository`/
      `setEntryRepository`, `hasEntryStorageOverride`,
      `resetEntryStorageOverrides` and friends renamed to match.
- [x] Per-domain modules: `media/storage.ts`, `users/storage.ts`,
      `settings/storage.ts`, `notifications/storage.ts`, `cron/storage.ts`,
      `plugins/runtime/plugin-tracking-storage.ts` → `repository` naming,
      including their `create*Storage` factories and `*Storage` types.
- [x] While inside `entries/repository/`: `EntryRecord` → `EntryRow` (the
      house suffix for persisted shapes — `RelationshipRow`, `CronRow`,
      `NotificationRow`), keeping the pairing with `EntryWrite` coherent.
- [x] Add the `TERMINOLOGY.md` entries (`repository`, and sharpen `storage`)
      and the `decisions/` record with the rejected alternatives.

### WS4 — component filename casing

Thirteen PascalCase component files sit in a kebab-case tree (70 kebab-case
component siblings). Rename files only; exported component names stay
PascalCase.

- [x] `AuthCard.tsx` → `auth-card.tsx`
- [x] `DeleteEntryModal.tsx` → `delete-entry-modal.tsx`
- [x] `PublishPanel.tsx` → `publish-panel.tsx`
- [x] `FieldTreeForm.tsx` → `field-tree-form.tsx`
- [x] `MediaCard.tsx` → `media-card.tsx`
- [x] `MediaDetailModal.tsx` → `media-detail-modal.tsx`
- [x] `MediaRow.tsx` → `media-row.tsx`
- [x] `ComponentErrorBoundary.tsx` → `component-error-boundary.tsx`
- [x] `ComponentPageView.tsx` → `component-page-view.tsx`
- [x] `SettingsPageForm.tsx` → `settings-page-form.tsx`
- [x] `PluginSlot.tsx` → `plugin-slot.tsx`
- [x] `LocaleSwitcher.tsx` → `locale-switcher.tsx`
- [x] `Brand.tsx` → `logo.tsx` (its only export is `Logo`)

### WS5 — smaller renames

- [x] `builtInRole` → `permissionsForBuiltInRole` in
      `packages/astromech/src/permissions/index.ts`. It returns
      `Permission[]`, not a role; the new name matches the existing
      `permissionsFor` phrasing. Re-exported from the package root.
- [x] `ConfirmOutcome` → `ConfirmationResult` in
      `packages/astromech/src/policies/confirmation.ts` (`result` ×12,
      `outcome` ×1). The `confirm` verb itself stays — it is a real domain
      concept, not a synonym for `validate`.
- [x] `checkRichTextDocument` → `validateRichTextDocument` in
      `packages/astromech/src/fields/rich-text/validate.ts` (`validate` ×23,
      `check` ×4). It returns `true | string`, not a bare boolean, so the
      rename went ahead. Not `validateRichText`: that name is taken in the
      same file by the `FieldValidator` this helper backs. The `document`
      noun stays (ProseMirror vocabulary).
- [x] `UseEntryFormReturn` → `UseEntryFormResult` in
      `packages/astromech/src/admin/hooks/use-entry-form.ts` (sibling hooks
      all say `Result`).
- [x] `fields/pipeline.ts` → `fields/parse-fields.ts`. Its exports are
      `parseFields`, `ParsedFields`, `assertNoFieldErrors`; "pipeline" is a
      colliding metaphor, and the `coerce → default → validate` sequence is
      fixed inside one function rather than composed. The five
      `tests/fields/pipeline-*.test.ts` files followed, and the file-local
      `PipelineContext` became `ParseContext`.
- [ ] ~~`transport/http/routes/http-routes.shared.ts` → `http-routes.ts`~~ —
      **dropped.** The premise is wrong. `ARCHITECTURE.md` lines 139-143 say
      the suffix here carries the same isomorphic meaning it does everywhere
      else: "The fetch client sits on the same boundary and holds the same
      allowance, so the REST route table both halves of the HTTP transport
      read stays beside the routes it describes." The file keeps its name.
- [x] The four `methods.ts` files whose only export is `{domain}Contract`
      (`media`, `notifications`, `settings`, `users`) → `contract.ts`, so the
      filename and the export use the same word.
- [x] `v` → `value` on the six exported coercers in
      `packages/astromech/src/fields/built-in-rules.ts` (`coerceEmail`,
      `coerceUrl`, `coerceNumber`, `coerceDate`, `coerceKeyValue`,
      `isJsonValue`).
- [x] Normalize the internal delete helpers: no rename was needed.
      `deleteEntry` is the verb `service.ts` mounts and the compound is
      forced (`delete` cannot name a function declaration). `deleteOne` is the
      per-id worker with no importer outside the file, so it simply stopped
      being exported, and moved below `deleteEntry` per the `code` skill's
      "the main thing comes first".

### WS6 — directory moves out of the layer-word buckets

- [x] Lift `utilities/registry.ts` to `src/registry.ts`, beside the
      composition root. In the layer diagram it stays on the pure-leaves row:
      the diagram encodes import direction, not filesystem location, and
      putting it on the composition-root row would claim the ten capability
      registries import upward. It imports only `@/errors/index`.
- [x] `utilities/image-drivers.ts` → `media/image-drivers.ts`;
      `utilities/image-widths.ts` → `media/image-widths.shared.ts`. The suffix
      is load-bearing: `media/serving/image/url.shared.ts` imports it, so it
      is in the client graph.
- [x] `utilities/entry-capabilities.ts` → `entries/capabilities.ts`;
      `utilities/entry-type-ids.ts` → `entries/type-ids.shared.ts` (four admin
      modules import it directly). `ARCHITECTURE.md` was already citing
      `entries/type-ids.shared.ts` as an example before the file existed
      there.
- [x] `admin/lib/settings-page-save.ts` →
      `admin/components/pages/settings-page-save.ts`, beside its only
      consumer; `admin/lib/` dissolved.
- [x] `admin/support/ui-instance-guard.ts` →
      `admin/components/ui/instance-guard.ts`, beside its two consumers;
      `admin/support/` dissolved.
- [x] `entries/utils/url.shared.ts` → `entries/entry-url.shared.ts`;
      dissolve `entries/utils/`.
- [x] What remains in `utilities/` is the accepted miscellany bucket. The
      audit's list of six was short: `labels`, `log`, `permission-match`,
      `plugin-namespace`, `with-default-shape` and `ai-context` also stay.
      `ARCHITECTURE.md`'s map is updated, and its `utilities/` line was
      already stale (it listed `entry-fields` and `rich-text`, both of which
      live in `fields/`).
- [x] `tests/` mirrors `src/`, so two test files followed their subject:
      `tests/utilities/registry.test.ts` → `tests/registry.test.ts` and
      `tests/utilities/entry-types.test.ts` → `tests/entries/type-ids.test.ts`.
- [x] Write the `decisions/` record —
      `decisions/0074-leaves-are-placed-by-subject.md`. It carries the new
      invariant: a pure leaf is placed by subject and may be imported from any
      layer, so `config/` and `permissions/` reading the four moved files from
      below is allowed and named in `ARCHITECTURE.md`.

## Explicitly not doing

- **`maybeGet*` wrapper renames** — dissolved by WS1: the primitive's `get`
  is now the nullable read, so the wrappers' existing names become honest.
- **`get` → `load`/`fetch` on async reads** — rejected; `get` is the CRUD
  read verb (decision 4).
- **`validate(schema, data)` changes** — kept as is (decision 5). The
  triplication of the helper itself is tracked in
  `roadmap/planned/three-identical-validate-helpers.md`.
- **Renaming the blob side to `blob/`** — inverted by decision 3 and again by
  `decisions/0075`; the file side keeps `storage`.
- **`types/` break-up** — the shared-contracts barrel stays; co-location is
  a per-contract judgement for later work, not a sweep.
- **`http-routes.shared.ts` → `http-routes.ts`** — dropped from WS5 on a wrong
  premise. `ARCHITECTURE.md` states the suffix carries the same isomorphic
  meaning there as everywhere else, because the fetch client sits on that
  boundary too.
- **`v` → `value` beyond `fields/built-in-rules.ts`** — `v` is a house idiom
  (eight uses in `database/define-table.ts`, four in `database/codec.ts`, plus
  zod transforms and setState callbacks). WS5 covered the six exported
  coercers the audit named, and `coerceRichText` in
  `fields/rich-text/validate.ts` still takes `v`. A broad sweep is separate
  work if it is wanted at all.

## What landed

|                                   |                            |
| --------------------------------- | -------------------------- |
| WS1 registry `get` / `getOrThrow` | shipped                    |
| WS2 acronym casing                | shipped                    |
| WS3 `storage` → `repository`      | shipped                    |
| WS4 component filenames           | shipped                    |
| WS5 smaller renames               | shipped, two items dropped |
| WS6 directory moves               | shipped                    |

Records written: `decisions/0072-the-registry-probe-is-get.md`,
`decisions/0073-acronyms-are-title-case.md`,
`decisions/0074-leaves-are-placed-by-subject.md`,
`decisions/0075-repository-for-data-access.md`.
