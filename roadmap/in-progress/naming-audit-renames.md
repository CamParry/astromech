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

- [x] In `packages/astromech/src/utilities/registry.ts` (both `createRegistry`
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

**Parked.** Not a naming call. It reverses a rule written in three
places: `.claude/skills/code/SKILL.md` ("**No repository pattern.** …
Name `createXStorage`, never `XRepository`"), `decisions/0003`'s
"Entries: storage is the adapter, and no repository wrapper", and
`decisions/0009`, which found the word returning as `notificationsRepo`
and called it a rule violation. Decision 3 above was settled without
those in view, so the data-layer question gets looked at on its own
before any rename. Nothing landed.

Two things worth carrying into that discussion. `decisions/0003`'s
objection splits: "repositories pre-flatten the query surface" argues
against adding a _layer_, which this was not (`createRepository` would
have returned the identical object, open `where` grammar and all),
while "every DB-touching unit being called storage removes a
distinction that was never carrying weight" was a fair trade only
while `storage` had one meaning — the file drivers later took the same
word. And `EntryRecord` → `EntryRow` stands on its own: `TERMINOLOGY.md`'s
"Entry vs Record" already says to avoid "record", and `Row` is the
house suffix (`RelationshipRow`, `CronRow`, `NotificationRow`).

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
