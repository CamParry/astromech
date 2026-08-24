# Naming pass

One pass over the core's naming: the service/method/API/client vocabulary, the
`policies/` and `entries/` modules, the table exports, module and concept names,
the public subpaths, and the docs that describe all of it.

**Landed 2026-08-04** — items 1–20 of the plan's order table, merged to `main` as
seven commits on `refactor/naming-pass`. Every batch was verified at the full
gate and at the exact test baseline (2465 core / 24 authoring / 86
schema-engine); the merge was verified again on `main` with `build`,
`check:config`, `check:node-imports`, `db:generate` and a demo boot.

Items 21–22 (§D and §A5) followed on `refactor/public-subpaths`, at a baseline
of 2465 core / 32 authoring / 86 schema-engine — the authoring figure moved
because the content-block work landed in between, not because this pass touched
a test.

§I, the last section, landed on `refactor/definitions-are-objects` at a baseline
of 2460 core / 79 authoring / 86 schema-engine. **The pass is complete** — the
spec is deleted.

The headline decisions are recorded in
`DECISIONS.md`,
`DECISIONS.md`,
`DECISIONS.md`,
`DECISIONS.md` and
`DECISIONS.md`.

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

### `fields/` (§H) — `83deaca`, `93b25ef`, `02b3c48`, `e5d5e81`, `225211f`

- [x] **Layout field / presentational.** Four layout fields (`section`, `tabs`,
      `tab`, `accordion`) and four nested fields (`group`, `repeater`, `blocks`,
      `tree`), stated once in `TERMINOLOGY.md`; three docstrings that each
      restated a different version now point at it
- [x] "Chrome" dropped everywhere in the module and its consumers. It meant
      _presentational_ in one half of its sites and the admin _shell_ in the
      other. "Container" retired as the category word; **nested field** carries
      the distinction in prose
- [x] `isLayout` and `isContainer` deleted. `isLayout` had one occurrence — its
      own declaration; `isContainer` was set on exactly the four types that fill
      the `children` slot, so `descriptor.children !== undefined` replaced its
      two readers. `isRelation` kept
- [x] `FieldDefinition.container` → `boxed` (default `true`), one consumer
      outside core. The admin already said `am-group-field--boxed`
- [x] `formatFieldPath` → `formatInstancePath`, `parseFieldPath` →
      `parseInstancePath`. 83 references, none outside `packages/astromech`
- [x] `helpers.ts` split into `flatten.ts` and `count.ts` (`lengthStatus` →
      `countStatus`), with the label pair folded into the existing
      `utilities/labels.ts`
- [x] `scoped-reads.ts` → `field-reads.ts`, `ScopedReads` → `FieldReads`;
      `valuesEqual` moved to `utilities/values-equal.ts`. `patch.ts` →
      `values.ts` rather than moving `projectToSchema` out of it
- [x] `columns.ts`'s suggested alias went plural, matching every real consumer
- [x] `DECISIONS.md`

Baseline moved for the first time in this pass, to **2460 core / 179 files**:
five assertions read the deleted `isContainer` flag and went with it, and the
`valuesEqual` tests split out of the renamed reads test into
`tests/utilities/values-equal.test.ts` when the function moved. Authoring (32)
and schema-engine (86) unchanged.

### `resource` (§J) — `8759d0a`, `52ef1fe`, `6f9b0b9`, `c024df3`

- [x] `ResourceType` gains `'setting'` and stops living under "Relationships":
      it now names anything that carries fields and runs the field pipeline
- [x] **Beyond the spec** — the real consumer of the concept was an anonymous
      union written twice in `types/fields.ts`, on `FieldValidationContext` and
      `DocumentValidationContext`, already carrying `'setting'`. Both now
      reference `ResourceType`, as do the three pipeline test fixtures that
      mirrored it. Without this `ResourceType` would still have had zero use
      sites and the real thing would still have been anonymous
- [x] `TargetKind` keeps its name and its three members, with a docstring
      saying it is the relation-eligible subset. Membership unchanged, so the
      exhaustive `switch` in `database/storage/resource-existence.ts` stands
- [x] `fields/document-validators.ts` → `fields/resource-validators.ts`; the
      four registry functions and the three public types follow
- [x] `ctx.documentValidate` → `ctx.resourceValidate`, 32 sites, all inside
      `packages/astromech`. The prose went with it, in the source comments and
      in `apps/docs/content/field-validation.md`, whose "Whole-document
      validation" heading is now "Whole-resource validation". "Document"
      survives only where it means a ProseMirror document
- [x] `tests/fields/pipeline-document.test.ts` → `pipeline-resource.test.ts`,
      `tests/services/entries/document-validation.test.ts` →
      `resource-validation.test.ts`
- [x] Registry keys untouched — they are runtime keys, so the `media` singular
      / `users` plural inconsistency is recorded rather than fixed. The
      authored config key stays plain `validate`, and `details.form` stays: a
      wire shape, not vocabulary
- [x] `DECISIONS.md`, and a
      `TERMINOLOGY.md` entry

No migration: the `sourceKind`/`targetKind` columns infer their own literal
union from `col.enum` and were never linked to either named type.
`MediaUsage.sourceKind` keeps its third hand-written copy, because a pure leaf
may not import a capability. Baseline held at **2460 core / 179 files**, with
authoring at 79 and schema-engine at 86.

### Docs (§E)

- [x] `ARCHITECTURE.md`: the layer model and directory map both listed a
      top-level `client/` that does not exist — the fetch client is a leaf
      inside the HTTP transport
- [x] Project `CLAUDE.md` matched to the global naming rules' 2026-08-04 split
- [x] `DECISIONS.md`

### Definitions are objects (§I) — `0a1bce6`, `c70f573`, `161aa3a`, `56ee7a7`, `044a16c`

`defineX` returns an `X`; `Descriptor` and `Definition` stop being suffixes, and
the derived form takes the `Resolved*`/`Registered*`/`Collected*` prefix.
Rationale, rejected names and the exceptions are in
`DECISIONS.md`.

- [x] Admin `TableDefinition`/`FormDefinition` → `ResolvedTable`/`ResolvedForm`,
      `types/definitions.ts` → `types/resolved.ts`, `admin/definitions/` →
      `admin/rendering/`, `derive.ts` → `resolve.ts`. Cleared the name `Table`
- [x] `TableDescriptor` → `Table`, `descriptor-snapshot.ts` →
      `table-snapshot.ts`, and the word off every identifier that carried it
- [x] `PluginServiceMethod` → `ServiceMethod`, `ServiceMethodDescriptor` →
      `ServiceMethodContract`. **The plan had these two backwards** — the
      object with the handler is what `defineServiceMethod` returns
- [x] `FieldTypeDescriptor` → `FieldType`, `FieldType` → `FieldTypeName`,
      `FieldDefinition` → `Field`, `BlockDefinition` → `Block`,
      `MessageDescriptor` → `MessageRef`
- [x] `EntryTypeConfig` → `EntryType` (+ `ResolvedEntryType`, `AdminEntryType`),
      `DefinedHook` → `Hook`, `defineRegistry` → `createRegistry`
- [x] Four rows of the plan's rename table were wrong against the code and were
      dropped: `defineCommand` is citty's, `definePluginTable` already returns a
      `Table`, `defineAdminPage` was already compliant, and `defineFieldType`
      has no authoring path to justify it

Baseline held at **2460 core / 179 files** throughout, authoring 79,
schema-engine 86, with `db:generate` reporting no changes.

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
- [ ] **"Descriptor" survives in two runtime strings.**
      `transport/tools/dispatch.ts` returns `no input schema declared on the
descriptor` (asserted in `tests/transport/mcp/tools.test.ts`) and
      `errors/permission.ts` says `carries no method descriptor`. Both are
      asserted or user-facing output, so changing them is a behaviour change —
      the same line drawn for "surface" above
- [ ] **`@astromech/schema-engine` keeps "descriptor"** in ~8 places including
      an asserted error string. Deliberate: it never holds a `Table`, it
      consumes snapshots, and there the word means the caller's source-of-truth
      definitions generically. Revisit only if the engine grows a `Table` import
- [x] **`DECISIONS.md` had two `0007` files** — fixed by the documentation pass:
      the media-browser record became `0010`, and `DECISIONS.md` now
      carries an index so a collision is visible when the next entry is written
- [x] **`DECISIONS.md` had two `0015` files** — the index guard above was not
      applied when the approval record landed 50 minutes after
      `0015-public-subpaths-mirror-the-source.md`. The approval record was the
      later of the two and became `0020`. It was not free: by the time it was
      renumbered, `0018-one-chat-session-not-a-library.md` cited it, so an
      append-only record had a dead backticked path that `check:docs` fails on.
      Correcting a path is not revising a rationale, so it was fixed in place —
      but the coupling is the point. Records cite each other by filename, and a
      filename that carries an allocated number is not stable
- [ ] **The index guard does not prevent collisions, it only records them.**
      Two concurrent branches both claimed `0018` in this session — the chat
      session record and the naming record — and nothing caught it until the
      merge conflicted on `README.md`. An index a branch edits in isolation is
      exactly as stale as the directory listing it replaced. A number allocated
      at write time cannot be unique across branches; the fix is either a
      non-sequential id, or allocating the number at merge time
