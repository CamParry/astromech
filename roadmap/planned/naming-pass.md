# Naming pass

One pass over the core's naming: the service/method/API/client vocabulary, the
`policies/` and `entries/` modules, the table descriptor exports, four module and
concept names, the public subpaths that disagree with the source, and the docs
that describe all of it. All renames, no behaviour change.

**Plan:** `specs/naming-pass.md` (2026-08-04) — evidence per item, call-site
lists, sequencing, and the deferred questions. It absorbs the earlier
`policies-naming` roadmap file and spec, both deleted.

The headline is §A. The same concept answers to `service`, `api`, `method` and
`client` depending on which layer you're looking at, and three type files
(`types/api.ts`, `types/client.ts`, `types/services.ts`) are three views of the
same operations with no name saying which view. Previous revisions didn't stick
because each picked a better word rather than deciding what the word names. The
fix assigns one noun per role and lets "API" mean only the HTTP API.

## Change

### Service vocabulary (§A)

- [ ] **`*Api` types → `*Service`** — `EntriesApi` → `EntriesService` and the
      five siblings, plus `TypedEntriesApi`. Frees "API" for the HTTP surface,
      which `transport/local/index.ts:1-9` currently uses both ways in one
      docstring. `AstromechApiError` keeps its name (it is an HTTP error).
- [ ] **One export pattern across six domains** — `entries`, `mediaApi`,
      `usersApi`, `settingsApi`, `contentApi`, `notificationsRepo` all become
      `<domain>Service`. `notificationsRepo` also violates `decisions/0003` and
      the `code` skill's "never `XRepository`".
- [ ] **Type file renames** — `types/api.ts` → `services.ts`,
      `types/services.ts` → `methods.ts`. The two swap a word, so it needs a
      temp name or two commits.
- [ ] **`<domain>/descriptors.ts` → `methods.ts`** (6 files) — they hold
      `ServiceMethodDescriptor`s, and this frees bare "descriptor" to mean
      table-or-field.
- [ ] **Give the two clients different names** — both `astromech/local` and
      `astromech/fetch` currently export `const Astromech: AstromechClient`.
      _Needs a decision: check which appears more in `apps/docs/` first._

### `policies/` (§B)

- [ ] **`principal` → `role`** — 32 sites across 7 files. `decisions/0005`
      settled on `ctx.role`. Align `Role | undefined` with `ctx.role`'s
      `Role | null` while in there.
- [ ] **`withPermissions` → `permissionsFor`** — `with*` means HOF everywhere in
      the JS ecosystem; this is a factory returning a predicate bag.
- [ ] **`ScopedService` → `ScopedServices`, file → `scoped-services.ts`** —
      ⚠️ the deleted spec said `ScopedApis`; that was correct only under the old
      vocabulary. Don't re-derive it.
- [ ] **`GateOutcome` → `ConfirmOutcome`, `confirm-gate.ts` → `confirmation.ts`**
      — one type in ten uses a noun its nine siblings don't, and "gate" is the
      security-boundary word the header spends a paragraph disowning.
- [ ] **`Surface*` → `MethodFilter`/`filterMethods`/`FilterResult`** — the file's
      own header names the ecosystem word it copies (GitHub's and Stripe's MCP
      `--read-only` filters). Also `transport/cli/surface-args.ts` →
      `filter-args.ts`.
- [ ] **Move `with-permissions.ts` into `permissions/`** — it wraps `can()`.
      Leaves `policies/` as one coherent thing.
- [ ] **`decide` → `allowedFor`** (`annotate-manifest.ts:30`).

### Modules and concepts (§C)

- [ ] **`kernel/` → `boot/`** — Laravel's `Kernel` (where the name came from) is a
      request handler; ours is startup wiring, and already contains `boot.ts`.
      Public `astromech/astro` is unaffected.
- [ ] **`context/` → `request-context/`** — `TERMINOLOGY.md` says bare "context"
      in this codebase means React's. The rule was written after the directory.

### Public subpaths (§D)

- [ ] **`astromech/db/*` → `astromech/database/*`** — internal is `database/`; the
      "keep the subpath" note predates having no consumers to protect.
- [ ] **Align `astromech/images/*` with `src/media/serving/image/`** and with
      `astromech/storage/*`'s singular form. Consider folding `astromech/Image`
      (the only capitalised subpath) into `astromech/media/image`.

### Table descriptor exports (§F)

- [ ] **`<noun>` → `<noun>Table` on all ten core `defineTable` exports** —
      `entriesTable`, `entryVersionsTable`, `entryPreviewTokensTable`,
      `mediaTable`, `settingsTable`, `notificationsTable`, `rolesTable`,
      `relationshipsTable`, `cronTable`, `pluginsTable`. Marks the low-level
      table object apart from the domain and service words. All three plugin
      tables already do this (`redirectsTable`, `submissionsTable`,
      `backupRunsTable`); core is the holdout. 25 value-import lines, and it
      deletes the eight aliases in `database/schema.ts:26-32` and
      `entries/internal/relationships.ts:14`. Public via `astromech/db/schema`.
- [ ] Record the convention in the `code` skill's storage-pattern section and in
      the `definePluginTable` authoring docs.

### `entries/` (§G)

- [ ] **Dissolve `internal/supports.ts`** — its filename names the axis the
      _other_ file owns. `assertCapability` → `internal/type-config.ts`,
      `getStagingStorage` → `storage/registry.ts`. ⚠️ `supports` (what storage
      can do) and `capabilities` (what a type turns on) are two real axes; don't
      merge them. Closes the blocked `entries-module-reshape` Layer 2 bullet.
- [ ] **`incomingRelations` → `incomingRelationships`** (+ `IncomingRelation`,
      `operations/relations.ts`, `useIncomingRelations`) — `TERMINOLOGY.md` says
      relation is the field type, relationship is the index row, and this returns
      index rows. 12 src + 5 tests, public. `pruneDanglingRelations` stays.
- [ ] **`relationshipsRepo` → `relationships`** — 8 local sites in
      `operations/delete.ts`, `operations/trash.ts`, `jobs/trash-purge.ts`. Same
      rule violation as `notificationsRepo`; Reshape Layer 1 caught the exports
      and missed the locals.
- [ ] **`type-registry.ts` → `type-ids.ts`** — it registers nothing;
      `storage/registry.ts` is the real registry.
- [ ] **Form slips** — `entryHooksActive` → `hasEntryHooks`, `entrySnapshot` →
      `loadEntrySnapshot`, `runDeleteWithHooks`'s `force` → `permanent`,
      `internal/diff.ts` → `internal/deep-equal.ts`,
      `internal/validation.ts` → `internal/parse.ts` (`validate` → `parseWith`).
- [ ] Fix `entries/service.ts:6` — "supports gating" means capability gating.
- [ ] **Consistency, not naming (§G8):** the three plugin entry types
      (`forms/form.ts:29`, `forms/submission.ts:14`, `redirects/redirect.ts:15`)
      declare `: EntryTypeConfig` while the demo and both doc examples use
      `defineEntryType(…)`. Adopt the helper in the plugins and say so in
      `apps/docs/content/entry-types.md`. `defineEntryType` itself **stays** —
      `defineEntry` was considered and rejected (see §G "don't churn").

### `fields/` (§H)

- [ ] **Settle the two categories: `layout field` (presentational) vs a plain
      field.** Stated three times today with two names ("layout container",
      "chrome container") and three memberships — three data containers in
      `types/fields.ts:4-7`, four in `core-descriptors.ts:4-9`, `tabs` missing
      from `builder.ts:6-8`. Payload's term is Layout Fields, on the same rule.
      One `TERMINOLOGY.md` entry; the three docstrings point at it.
- [ ] **Drop "chrome"** (10 sites) — "presentational" for the field sense, "shell"
      for the admin sense, which the admin already uses.
- [ ] **Retire "container" as the category word** — it means a visual box in
      Bootstrap, Tailwind, CSS container queries and Filament, so "data
      container" reads backwards. Use "nested field" in prose where needed.
- [ ] **Delete `isLayout`** (declared at `types/fields.ts:287`, never set, never
      read) **and `isContainer`** (redundant: `descriptor.children !== undefined`
      already answers it).
- [ ] **`FieldDefinition.container` → `boxed`** — it controls whether a box is
      drawn, not containment. Public.
- [ ] **`formatFieldPath` → `formatInstancePath`, `parseFieldPath` →
      `parseInstancePath`** — both docstrings already say "instance path",
      `TERMINOLOGY.md` defines the pair, the DB column is `instancePath`, and
      `relationship-edges.ts:79` assigns `instancePath` from the wrong-named
      function.
- [ ] **Split `helpers.ts`** into `flatten.ts` + `count.ts`, labels into the
      existing `utilities/labels.ts`. Its header is a three-way merge changelog.
      `lengthStatus` → `countStatus` (matches the public `count` option).
- [ ] **`scoped-reads.ts` → `field-reads.ts`**, `ScopedReads` → `FieldReads` —
      "scoped" already means permission-, plugin- and request-scoped. Move
      `valuesEqual` to `utilities/`.
- [ ] **`projectToSchema` out of `patch.ts`** — it isn't a patch operation.
- [ ] **`columns` plural everywhere** — file, subpath, and the header's
      `import * as column` alias. Matches `fields`.
- [ ] Recorded, not fixed: **`tabs()` is the only factory taking no name** and
      hardcodes `name: 'tabs'`, so two in one entry type collide.

### Definitions are objects (§I)

- [ ] **`defineX` returns an `X`; the runtime form takes the qualifier.**
      `TableDescriptor` → `Table`, `ServiceMethodDescriptor` → `ServiceMethod`,
      `FieldTypeDescriptor` → `FieldType`, `EntryTypeConfig` → `EntryType`,
      `DefinedHook` → `Hook`, `FieldDefinition` → `Field`, `BlockDefinition` →
      `Block`. Both `Descriptor` and `Definition` disappear as suffixes.
      `Resolved*` / `Registered*` / `Collected*` already carry the other side
      (130-odd uses).
- [ ] **Clear the collision first:** admin `TableDefinition` / `FormDefinition` →
      `ResolvedTable` / `ResolvedForm`, `types/definitions.ts` →
      `types/resolved.ts`, `admin/definitions/` → `admin/rendering/`. They are
      derived by `admin/definitions/derive.ts`, so they were never definitions.
- [ ] **Free `FieldType`:** the incumbent `type FieldType = AnyFieldType` is a
      union of string literals and is really `FieldTypeName`. Add
      `defineFieldType`; `fields/descriptors.ts` → `field-type-registry.ts`,
      `core-descriptors.ts` → `core-field-types.ts`.
- [ ] **`defineRegistry` → `createRegistry`** (24 uses) — it creates a runtime
      slot, it defines nothing. Found by the rule, not by inspection.
- [ ] **`PluginServiceMethod` → `ServiceMethodFn`** — otherwise it reads as a
      sibling of `ServiceMethod` and isn't (§I1).
- [ ] `MessageDescriptor` → `MessageRef` — borrows FormatJS's name without its
      shape. Optional.
- [ ] Unchanged: `AstromechConfig` (the `defineConfig` → config convention) and
      `definePlugin` returning a factory (recorded decision, now the documented
      exception).

### A word for entries + media + users + settings (§J)

- [ ] **Adopt `resource`.** `ResourceType` (`types/domain.ts:63`) and
      `TargetKind` (`relationship-edges.ts:35`) are the same three-member union
      under two names. `ResourceType` gains `'setting'`; `TargetKind` keeps its
      name as the relation-eligible subset and says so in its docstring.
- [ ] **`document-validators.ts` → `resource-validators.ts`**,
      `DocumentValidator` → `ResourceValidator`. "Document" is undefined
      vocabulary that reads as a ProseMirror doc, two directories from
      `docToMarkdown`. The new name explains the key space it already has
      (`entry:<type>`, `media`, `users`, `setting:<path>`).

### Docs (§E)

- [ ] **`ARCHITECTURE.md`** — the layer model lists a top-level `client/` that
      doesn't exist (it's `transport/http/client/`); line 72's "`api/` no longer
      exists" is stale while `types/api.ts` is 404 lines; plus the §C and §D
      moves.
- [ ] **Project `CLAUDE.md`** — match the global file's 2026-08-04 banned-list
      split (add `engine`, `pipeline`, `kernel` to taken-in-domain; move
      `orchestrator` there from the quality list).
- [ ] **`decisions/0008-service-method-client-vocabulary.md`** — record §A's
      four-role model and the revisions it replaces. Most re-litigable item here.
- [ ] **`decisions/0009-definitions-are-objects.md`** — record §I's rule and, in
      particular, why "definition" failed: it implies information without
      behaviour, and `FieldTypeDescriptor` holds `build`/`coerce`/`validate`/
      `children`. Also records overturning `TERMINOLOGY.md`'s `EntryTypeConfig`
      decision (§I3), which was made explicitly "to avoid ambiguity".
- [ ] **`TERMINOLOGY.md`** — new entries for layout field vs field (§H1),
      `resource` (§J), and the `EntryType`/`Entry` + `Field`/field-values
      asymmetry (§I). Reword "Entry vs Table (as data worlds)" so its prose
      doesn't drift from the new `Table` type (§I2).

### Verify

- [ ] `typecheck`, `lint`, `lint:deps`, `test:run`, `build`, plus a demo boot
      (`apps/demo` has no typecheck, so a broken subpath only shows at runtime).
      `db:generate` must report "No schema changes".
- [ ] `tests/policies/methods-export.test.ts` asserts the `astromech/methods`
      export list by name — it changes in the same commit or it fails. That's the
      intended tripwire. `tests/db/descriptor-snapshot.test.ts` is the same
      tripwire for §F, and `tests/transport/mcp/parity.test.ts` for §G3.
- [ ] `db:generate` must still report "No schema changes" after §F — the rename
      touches descriptor identifiers, never the SQL table names inside
      `defineTable`.

## Notes / caveats

- **Land when `roadmap/in-progress/` is quiet.** Everything here is a rename, so
  it conflicts with anything mid-flight in the same files. Five features are
  in-progress (`ai-integration`, `media-admin-ui`, `media-browser-split`,
  `entries-module-reshape`, `d1-driver`). The 2026-08-03 attempt was shelved for
  exactly this. Same discipline as `drop-js-import-extensions.md`, and those two
  will conflict with each other — order them, don't parallelise.
- **§A goes as one branch, one commit.** Splitting it means two vocabularies
  live at once, which is worse than one wrong one.
- Items touching `astromech/methods` and the root export are pre-1.0 with no
  external consumers. Cheap now, expensive later.
- **§I has an ordering dependency.** The admin `TableDefinition` must become
  `ResolvedTable` before `TableDescriptor` can become `Table`. Everything else in
  §I is independent. `FieldDefinition` → `Field` goes last: widest diff, no
  dependents.
- Most replacements are existing ecosystem words, but §H1, §I and §J each need a
  `TERMINOLOGY.md` entry, and §I overturns an existing one.
- **Deferred, not scheduled:** layout fields optionally taking a name that groups
  their content, and the `group`-vs-`section` collapse it implies (one type, two
  toggles: does the name nest child keys, is a box drawn).
  `group({container: false})` already occupies one corner of that 2×2, so the
  toggles are real. Behaviour change plus a stored-data migration, not a rename;
  needs its own session. ⚠️ An earlier draft of §H proposed _dropping_ the name
  param from `section`/`accordion`/`tab` to make the signature signal the data
  key. **Reversed 2026-08-04** — the intended direction is the opposite. Don't
  re-derive it.
- **Deferred, not scheduled:** `content/` → ? (most overloaded word in a CMS on
  the domain that needs it least, but `@astromech/authoring` shipped 2026-08-03
  and took the best candidate name); `dispatch` living under `transport/mcp/`
  while three transports use it; `manifest-registry.ts` sitting in `codegen/`
  without being codegen; and `policies/` → `guards/`, parked until
  `ai-integration` settles what that directory's job is.
- **Don't churn what works:** the `method` vocabulary is already fully
  consistent and is the model §A copies; `driver`, `transport/`, the domain
  names and `exports/` are all correct.
