# Unified Architecture: Entries, Storage, Definitions, Permissions

Status: **locked direction** (agreed 2026-06-10, pre-implementation). Supersedes parts of
`plugin-architecture.md` — see §6. Nothing is live; breaking changes are explicitly in
scope for this work.

## 1. Background & Motivation

Phase 18 surfaced a structural problem through the redirects plugin: storing redirects as a
core entry type leaked the storage choice into every surface — the content sidebar, the
`/admin/entries/redirect` URL, the root `sdk.entries` typing, and entry semantics (title,
draft status) that redirects don't have. Patching each leak individually (nav filtering,
typegen exclusion, scoped SDK helpers) treated symptoms.

The agreed resolution goes deeper, in two moves:

1. **Deepen the entry abstraction** instead of inventing parallel concepts. An entry type
   is THE unit of structured data; its storage, capabilities, and title-ness become
   configuration. Plugin data is namespaced, never merged into root config.
2. **Make serializable definitions the universal admin contract**, with fluent builders as
   an authoring veneer. This adapts Filament's single-source-of-truth DX to our hard
   constraint: admin config crosses a server→browser boundary as JSON + import-specifier
   strings (closures can never cross). Payload CMS validates this model at scale
   (string component paths + importMap ≈ our codegen).

Guiding values (user-stated): good DX defaults with minimal configuration; ability to add
complexity without redoing things from scratch; composability; one unified system across
user-land config, plugins, and core internals.

**Scope guardrail (the dogfooding rule):** we build only abstractions core itself consumes
(entry pages, redirects, forms-plugin needs). No speculative customization surface —
dashboard widget frameworks, arbitrary action injection, theming wait until something
concrete demands them. Astromech's admin serves the CMS; we are not building Filament.

## 2. Terminology

- **Definition** — a plain, JSON-serializable object describing a thing (`TableDefinition`,
  `FormDefinition`, `PageDefinition`, `FieldDefinition`). The canonical artifact: stored,
  serialized, rendered from. Chosen over "descriptor"/"schema"/"config" for consistency
  with existing `FieldDefinition`/`PluginDefinition` ("we have _defined_ a table").
  `Resolved*`/`Derived*` prefixes remain for post-processed browser-bound shapes.
- **Builder** — fluent chained authoring API that emits a definition
  (`table(...).columns([text('from').searchable()])` → `TableDefinition`). Pure veneer:
  zero runtime, object literals always equally valid.
- **`define*` factory** — typed identity function for an authored shape
  (`defineSdkMethod`, `defineHook`, `defineEntryType`). Enables file-splitting with full
  inference, no annotation ceremony.
- **Entry type** — the single concept for structured data, in core AND plugins. Has
  fields, capabilities, storage, optional title.
- **`EntryStorage`** — the internal contract a storage backend implements. The default
  (omitting `storage`) is **built-in storage** (the entries table) — docs name only;
  no code symbol. Custom backends come from helpers (`tableStorage(drizzleTable)`).
- **Capability** — an optional entry feature (`statuses`, `slug`, `translatable`,
  `versioning`, `trash`) declared by the entry type, supported (or not) by its storage.
- **Renderer + registry** — core React components that interpret definitions; registries
  map type keys → components (the existing field-type registry pattern, generalized).

## 3. Decisions (Locked)

### 3.1 Definitions are the rendering contract; core dogfoods them

Core's own admin pages (entry list/edit, eventually media/users) render from the same
`TableDefinition`/`FormDefinition` machinery plugins and user customization use. One
renderer; no plugin-API clone that drifts. `EntryTypeConfig` acts as a **macro**: core
derives each type's default Table/Form/Page definitions from
`single/plural/fields/adminColumns/views`. Users write what they write today (or less) and
get everything free; customization attaches in the same vocabulary plugins use.
_(Rejected: descriptors only at the plugin boundary; component-composition with a shadow
router — split-brain between manifest and component, chrome flags, stringly sub-routing.)_

### 3.2 Entry abstraction deepens; storage becomes pluggable

- **Universal entry contract:** `id`, `fields`, `createdAt/updatedAt/createdBy/updatedBy`.
  Nothing else is universal.
- **Everything else is a capability:** `statuses` (draft/published/scheduled + publish ops),
  `slug`, `translatable`, `versioning`, `trash`. The entry type declares intent
  (`versioning: true`); the storage declares support (static `supports` set); mismatch is a
  crash-loud boot error (same philosophy as `requiredEnv`). UI/API gate on the type's
  resolved capabilities — single truth, no runtime probing.
- **Built-in storage supports every capability** (today's entries table, unchanged
  default). **`tableStorage(drizzleTable)` v1 supports none** — minimal contract, exactly
  what redirects needs; capabilities added only when something concrete demands them.
- The storage interface is internal: users/plugin authors meet it only when opting out of
  built-in storage. An `EntryStorage` over an external API is possible but not v1.

### 3.3 Title is per-type configuration, not a universal

- **`titleField: string | false`** on the entry type. Names a real field — sorting and
  searching the title column operate on that field. **No template strings** (an
  interpolated display title would sort differently than it displays; rejected).
- Content types default `titleField: 'title'` (built-in title column retained — indexed,
  sortable); behavior today, zero config.
- `titleField: false` (default for custom-storage types): no Title list column (columns
  are the fields, e.g. From/To); headings fall back to type name ("Edit redirect",
  "New redirect"); same for breadcrumbs/delete confirmations.
- Titleless types display their **ID** in relationship contexts (never a first-column
  fallback — could leak data, e.g. form-submission fields) and are **excluded from global
  search**. No `relatable: false` flag yet: relationship targets are developer-declared,
  so protection is structural; add the flag when a real case demands it.

### 3.4 Plugin namespacing is total

- Everything a plugin exposes is namespaced by the plugin: API, SDK, permissions, nav,
  URLs. Root `config.entries` is **user-only**; plugin entry types never merge into it.
- **Qualified identity `{pluginName}/{type}`** (e.g. `redirects/redirect`). Bare keys valid
  inside their own namespace; cross-namespace references (relationship `target`) use the
  qualified form; core is the implicit root namespace. Separator is `/` because `:` is
  loaded with meaning in permission strings.
- **The entries API becomes a mountable module:** the same handler stack (pagination,
  search, validation, permission middleware) mounts at `/api/entries/*` (core types) and
  `/api/plugins/{name}/entries/*` (that plugin's types). One protocol, one implementation,
  different base path + permission root. The admin client is one entries client
  parameterized by base path. (Rejected: a parallel "data source" concept/API — new
  vocabulary for the same thing. Also rejected: a generic `/api/sources` protocol — it
  re-fronts the mature entries API speculatively.)

### 3.5 Plugin entry types auto-expose; SDK altitudes

Defining an entry type in a plugin automatically exposes it — wire (mounted entries API)
and typed SDK (`sdk.plugins.redirects.entries.*`) — gated by permissions. This
**supersedes the earlier "specified SDK methods only" decision**, whose objections
(root-namespace pollution, storage-as-API) are dissolved by qualification + the
storage-agnostic entries protocol. Three altitudes:

1. **Plugin-internal (`ctx`)**: full auto-scoped access to own types
   (`ctx.entries.query({ type: 'redirect' })` — no qualification noise).
2. **Admin wire**: full mounted protocol, permission-gated. Not suppressible per-verb
   (permissions already express "nobody"; immutability is a concept we don't have yet).
3. **Public typed SDK**: auto-typed entries access under the plugin namespace, plus
   hand-written `defineSdkMethod` methods for domain logic (`lookup`).

### 3.6 Permissions overhaul (breaking; do first)

- **Grammar: `resource[:identifier]:action` — action always last.** `entry:redirect:read`,
  `media:read`, `settings:read`. Fixes today's inconsistency (`entry:read:posts` vs
  `media:read`) and makes "all actions on one type" natural (`entry:redirect:*`).
- **Segment-wise wildcards:** `*` matches any one segment; trailing `*` matches any
  remainder. Enables `entry:*:read` (viewer role) and collapses editor's entry grants to
  `entry:*`.
- **Owner-first plugin tree:** every plugin-generated permission lives under the plugin
  root: `plugin:{ns}:entry:{type}:{action}`, `plugin:{ns}:lookup`. Core `entry:*` wildcards
  provably never touch plugin data (different roots).
- **Secure by default:** fresh plugin install grants nothing to non-admin roles; admin has
  `*`. The built-in editor does NOT see plugin entries until granted — deliberate
  (WordPress-style fixed editor archetypes never match real sites; the site builder
  explicitly composes editor access).
- **Grants are typed config composition**, replacing the `suggestedRoleGrants` admin-notice
  idea: plugins export bundles via `definePermissionBundles` (exported as e.g.
  `redirectsPermissions`, called `redirectsPermissions('manage')`); users spread them into
  role config alongside `builtInRole('editor')`. Roles stay code-defined and versioned.

### 3.7 Migrations: apps own the log, plugins expose schemas

The app's `db:generate` feeds core + app + plugin schemas to drizzle-kit as one schema set
→ one migration history in the app repo, reviewed and versioned by the app developer
(consistent with explicit-grants philosophy). Installing/upgrading a table-shipping plugin
⇒ rerun `db:generate`, review the diff. Plugin tables keep the `plugin_{alias}_` prefix
(already enforced in `src/core/plugin-schema.ts`); plugin schema changes should be
conservative/additive. _(Rejected: plugin-shipped migration logs — N logs, boot-time DDL
without review; auto-push — data loss.)_

### 3.8 Authoring: "chain the pieces, declare the wiring"

- **Builders for composable vocabularies:** fields (`text('from').required()`), columns,
  actions, `table()`/`form()`/`page()` bodies.
- **Object literals for wiring:** root `defineConfig({...})` and the plugin manifest stay
  declarative objects (manifests read well as objects; chaining adds ceremony).
- **`defineEntryType` accepts both** (object form keeps working verbatim).
- **`define*` factory convention:** singular factories wherever the unit has a handler,
  generics, or plausible own-file isolation — `defineSdkMethod<Input, Output>` (generics
  feed typegen: real signatures in `astromech.d.ts` instead of `Promise<unknown>` stubs),
  `defineHook` (payload type inferred from event key; **hooks become an array** of defined
  hooks instead of a record), `definePage`, `defineEntryType`, `defineEntryStorage`.
  Singular factories _eliminate_ plural wrappers (no `defineSdk`/`defineHooks` — the
  manifest field types the collection).
- **Ceremony threshold:** no factories for trivial leaf records (a permission declaration
  is three strings — literals in a list). Uniformity is not a reason to wrap.
- All factories/builders emit plain serializable definitions; zero runtime.

## 4. Shape Sketches (illustrative, not final)

```ts
// Redirects under the target architecture
export const redirects = definePlugin(() => ({
    package: '@astromech/redirects',
    label: 'Redirects',
    icon: 'Route',
    schema: { redirects: redirectsTable }, // drizzle, plugin_redirects_ prefix

    entries: {
        redirect: defineEntryType({
            single: 'Redirect',
            plural: 'Redirects',
            storage: tableStorage(redirectsTable),
            titleField: false, // no title anywhere
            // no statuses/versioning/translatable — capabilities off, storage minimal
            fields: [
                text('from').required().searchable(),
                text('to').required(),
                select('status', ['301', '302']).default('301'),
                boolean('enabled').default(true),
            ],
        }),
    },

    sdk: { lookup }, // defineSdkMethod in server/lookup.ts
    hooks: [slugChangeHook], // defineHook in server/hooks.ts
}));
// Auto-exposed: /api/plugins/redirects/entries/*, sdk.plugins.redirects.entries.*,
// plugin nav item, /admin/plugin/redirects list/edit pages — all derived defaults.
// Permissions generated: plugin:astromech-redirects:entry:redirect:{read|create|update|delete}
// User grants: roles.editor.permissions: [...builtInRole('editor'), ...redirectsPermissions('manage')]
```

```ts
// EntryStorage contract (internal; shape indicative)
type EntryStorage = {
    supports: Capability[]; // boot-validated vs type's flags
    list(params: ListParams): Promise<{ data: EntryRecord[]; total: number }>;
    get(id: string): Promise<EntryRecord | null>;
    create(data: EntryWrite): Promise<EntryRecord>;
    update(id: string, data: EntryWrite): Promise<EntryRecord>;
    delete(id: string): Promise<void>;
    // capability sub-surfaces (versions, publish, trash...) required iff declared
};
```

## 5. Implementation Phases

1. **Permissions overhaul** — reorder to `resource:identifier:action`, segment wildcards,
   `definePermissionBundles` + `builtInRole()`, update built-ins/API checks/`usePermissions`/
   seeds. Self-contained, breaking, foundational.
2. **Abstract entry core** — universal contract, capability flags + boot validation,
   `titleField`, `EntryStorage` interface with built-in storage as first implementation.
   Externally invisible for existing types.
3. **Namespaced plugin entries** — mountable entries API, qualified identity, plugin
   nav/URLs, typegen + SDK namespacing, `ctx.entries` scoping, `tableStorage`,
   `db:generate` orchestration. **Redirects on its own table is the validating plugin.**
4. **Definition-driven admin** — `TableDefinition`/`FormDefinition`/`PageDefinition`,
   core entry pages refit onto the renderer (dogfooding), customization attach points on
   entry types, registry generalization (cells/components).
5. **Builders + `define*` family** — the DX veneer across core and plugins.

Each phase ships independently; spec sections above note which phase lands them.

## 6. Supersessions & Open Questions

**Supersedes in `plugin-architecture.md`:** §3.5/§7 plugin-entries-in-root-config and
nav-filtering approach (now structural namespacing); §3.8/§10 permission grammar
(`plugin:<ns>:<key>` remains but nested grammar + reordering applies); the 18b
"specified SDK methods only" lean (see §3.5 here); `suggestedRoleGrants` (replaced by
permission bundles); `settings:read` page-default rationale survives but strings change
shape with the grammar migration. Hooks record shape → array of `defineHook` results.

**Open (decide during the owning phase):**

- Exact mounted-protocol details (pagination params, error shapes) — Phase 3.
- Typegen shape for qualified plugin entry types (`AstromechPluginEntryTypes`?) — Phase 3.
- Definition schemas in detail (column kinds, action model, page composition) — Phase 4.
- `defineEntryType` builder-form ergonomics; field builder vocabulary — Phase 5.
- Search config shape (`search: ['from','to']` per type) — Phase 2/3.
- Whether media/users converge on definition-driven pages — post-Phase 4, demand-driven.
