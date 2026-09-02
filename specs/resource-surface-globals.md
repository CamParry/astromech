# Resource surface: the globals stage

This spec holds the concrete shapes and rules for the globals stage of
`roadmap/in-progress/resource-surface.md`, and the chunks the work lands in. It
does not restate the model or the column template; the roadmap file owns those.
Delete this file when the globals stage ships.

## Settled before the stage started

- **The word is "globals"**, singular "global" for one item. It is the word
  Payload (`globals: []`), Craft ("Global Sets") and Statamic ("Globals") share
  for editor-owned, exactly-one, site-wide content, and the demo page already
  carries it. Rejected: "single types" (Strapi; two words, describes the
  constraint on a type, pluralizes badly as a table name), "singletons"
  (Sanity, Directus, Cockpit; names the mechanism, collides with the GoF
  pattern that `TERMINOLOGY.md` already uses the word for), and "settings" or
  "options" (WordPress; the code-first ecosystem reserves "settings" for
  operator config, and the KV table keeps the name for the `plugin:*` class).
  `DECISIONS.md` records this comparison and `TERMINOLOGY.md` gains a `Global`
  entry.
- **A site declares globals in a top-level `globals` array beside `entries`.**
  `admin.pages` keeps only component-mode pages. A fields-mode `AdminPage` no
  longer exists.
- **The identifier is `key`, and it is inside the object.** `slug` already
  means the editor-authored, per-locale URL identifier on `entry_content`,
  unique per `(type, locale)`; a global's identifier is developer-written,
  locale-invariant and never in a URL, so it pairs with `type` on entry types,
  not with `slug`. Craft and Statamic's "handle" is precise but not guessed.
  `globals` is an array of self-contained `defineGlobal` objects with a
  required `key`, not a record keyed by name, so host and plugin globals have
  one shape and a global can move between them unchanged. This diverges from
  `entries: Record<string, EntryType>` on purpose; duplicate keys are a
  crash-loud resolve error, not a type-level check.
- **Clean cut on `ctx.settings`.** A `GlobalsService` is added and the seo,
  backups and menus plugins and the demo move onto it in this stage. The
  `settings` module keeps the naked `plugin:*` KV class and nothing else: no
  field validation, no locale merge, no page lookup.
- **Full parity with entries in the admin**: fields form, locale switcher,
  publish panel, versions page, and the staged-change create, edit, merge and
  discard surface.
- **DDL only.** No settings rows are copied into the new tables. A dev database
  is rebuilt with `db:init`; leftover `globals`, `globals:<locale>` and
  `plugin:<ns>:/settings` rows in `settings` are dead data and harmless.

## Shapes

### Tables

`globals` (resource row): `id`, `key` (text, not null, unique), `createdAt`,
`updatedAt`, `createdBy`, `updatedBy`. Index: unique `(key)`. "Exactly one" is
this index.

`global_content`: `id` (ULID, internal), `globalId` (FK `globals`, cascade),
`locale`, `fields`, `status`, `publishedAt`, `stagedFor` (self FK, `no
action`), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`. Indexes:
`(globalId)`, `(stagedFor)`, unique partial `(globalId, locale) WHERE
staged_for IS NULL`.

`global_versions`: `id`, `contentId` (FK `global_content`, cascade), `version`,
`fields`, `status`, `createdAt`, `createdBy`. Index `(contentId, version)`.

The three tables live in `globals/tables.ts`, are re-exported from
`database/tables.ts`, sit in `CORE_TABLES` after `entryVersionsTable`, and are
keyed `globals`, `globalContent`, `globalVersions` in `database/types.ts`.

The `settings` table is unchanged.

### Ids

- A global is addressed by `key` everywhere public: config, URLs, service
  calls, the admin, permissions. `Global.id` is `globals.id`, present so a
  future FK target has the same shape as every other resource; nothing in
  this stage stores it.
- A host global's key is its declared `key` (`site`). A plugin global's
  key is qualified the way a plugin entry type is: `<namespace>/<key>`
  (`seo/settings`, `menus/main`), built with the same `QUALIFIED_SEPARATOR`
  and the plugin's `namespace`, never its `permissionNamespace`.
- Content-row ids are `ContentRowId`, shared with entries (below), and never
  cross the service boundary.
- Rows are created on demand. A declared global with nothing saved has no
  `globals` row; `get` returns `null` and the first `update` creates the
  `globals` row and the locale's content row in one transaction. There is no
  boot-time row sync.

### Config

```ts
// types/config.ts
type GlobalConfig = {
    /** Unique across the site and every plugin's globals. No `/` or `:`. */
    key: string;
    label: string;
    /** Lucide icon name for the sidebar. Defaults to a globe icon. */
    icon?: string;
    fields: EntryFields;
    /** Default false. */
    translatable?: boolean;
    /** Default true. `maxVersions` as for entry types. */
    versioning?: boolean | VersioningConfig;
    /** Default true. */
    statuses?: boolean;
    /** Default false. Requires `statuses`. */
    staging?: boolean;
    /** Unauthenticated `get` returns the published content. Default false. */
    public?: boolean;
    /** Show in the sidebar. Default true. */
    nav?: boolean;
    validate?: ResourceValidator;
};

type ResolvedGlobalCapabilities = {
    statuses: boolean;
    translatable: boolean;
    versioning: boolean;
    staging: boolean;
};

type ResolvedGlobal = Omit<GlobalConfig, 'key' | 'fields'> & {
    /** Bare for a host global, `<namespace>/<key>` for a plugin's. */
    id: string;
    capabilities: ResolvedGlobalCapabilities;
    fields: ResolvedEntryFields;
};
```

`GlobalConfig` follows Payload's name for the authored shape; `Global` is the
domain item (as `EntryType` and `Entry`). `defineGlobal` is an identity
function in `config/define-global.ts`, exported from the package root beside
`defineEntryType`.

- `AstromechConfig.globals?: GlobalConfig[]` and
  `PluginDefinition.globals?: GlobalConfig[]`, the same shape in both places.
- `ResolvedConfig.globals: Record<string, ResolvedGlobal>` and
  `pluginGlobals: Record<pluginName, Record<key, ResolvedGlobal>>`, built by
  `config/globals.ts` (`toResolvedGlobal`, `assertGlobalValid`) and
  `config/plugin-globals.ts`, mirroring `entry-types.ts` and
  `plugin-entries.ts`. Field trees go through `toResolvedFields`,
  `validateFieldTree` and `assertUniqueDataNames` as entry types do. A key
  containing `/` or `:`, and a key declared twice within the host's array or
  within one plugin's array, is rejected crash-loud naming both declarations.
- `AdminPage` loses `fields`, `translatable`, `validate` and `public`, and
  `component` becomes required. `resolveAdminPage` and `derivePluginPages`
  drop their XOR checks. `ResolvedAdminPage` loses `baseKey` and
  `translatable`. `config/public-settings.ts` no longer reads pages;
  `publicSettings` (the KV allowlist) survives unchanged.
- `AdminConfig.globals: Record<string, AdminGlobal>` and
  `plugins[].globals: Record<string, AdminGlobal>`, where
  `AdminGlobal = { label, icon?, fields: ResolvedEntryFields, capabilities:
  ResolvedGlobalCapabilities, public: boolean, nav: boolean }`. Plugin globals
  with `nav: true` join the plugin's `PluginNavItem` tree where its pages did.
- Codegen: `type-generator.ts` emits a fields type per global and a
  `TypedGlobalsService` keyed by global key, so `Astromech.globals.get({ key:
  'site' })` returns typed fields, mirroring `TypedEntriesService`. Goldens
  updated.

### `Global`

```ts
type Global = {
    id: string;
    key: string;
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    fields: JsonObject;
    status: EntryStatus;
    /** True when this read is the staged change rather than the canonical row. */
    staged: boolean;
    publishedAt: Date | null;
    createdAt: Date; // globals.createdAt
    updatedAt: Date; // global_content.updatedAt: this locale's last edit
    createdBy?: string | null; // global_content.createdBy
    updatedBy?: string | null; // global_content.updatedBy
};

type GlobalVersion = {
    id: string;
    key: string;
    locale: string;
    version: number;
    fields: JsonObject | null;
    status: EntryStatus | null;
    createdAt: Date;
    createdBy: string | null;
};
```

`EntryStatus` is reused, not duplicated; it is the status vocabulary of a
content row, and the type is not renamed in this stage.

### `GlobalsService`

Every method takes one options object with `key` first and `locale?: string`;
a missing locale is the default content locale, as on entries. The rules from
the entries stage carry over verbatim: `get` does not fall back to another
locale; `update` on a translatable global whose `(key, locale)` row does not
exist creates it, inheriting shared (`translatable: false`) fields from the
default-locale row; a non-translatable global rejects any locale other than
the default with `GlobalValidationError`; a staged row is addressed as
`{ key, locale, staged: true }`.

```ts
type GlobalsService = {
    get(opts: { key; locale?; full?; staged? }): Promise<Global | null>;
    update(opts: { key; locale?; data: { fields: JsonObject } }): Promise<Global>;
    publish(opts: { key; locale? }): Promise<Global>;
    unpublish(opts: { key; locale? }): Promise<Global>;
    schedule(opts: { key; locale?; publishedAt: Date }): Promise<Global>;
    versions(opts: { key; locale? }): Promise<GlobalVersion[]>;
    restoreVersion(opts: { key; versionId; locale? }): Promise<Global>;
    createStaged(opts: { key; locale?; data? }): Promise<Global>;
    getStaged(opts: { key; locale? }): Promise<Global | null>;
    mergeStaged(opts: { key; locale? }): Promise<Global>;
    deleteStaged(opts: { key; locale? }): Promise<void>;
};
```

There is no `query`, `create`, `delete`, `duplicate`, `trash` or preview
token: a global exists because the config declares it, and it has nothing to
list. An unknown key is `GlobalNotFoundError` from every method, including
`get`, since a declared-but-unsaved global is `null` and an undeclared one is
a caller error. Unauthenticated `get` succeeds only for a `public` global and
returns the published canonical row or `null`; `full` and `staged` need the
read permission. Validation runs `parseFields` with `resource: { kind:
'global', record }`, the global's `validate`, and the same lookups entries
build. Hooks are `global:beforeUpdate` and `global:afterUpdate` with
`GlobalUpdateContext = { key, locale, global: Global | null, data, user }`; a
before-hook may replace `data`. A version is snapshotted on `update` when
`fields` change, on `restoreVersion` before overwriting, and on `mergeStaged`
before overwriting, exactly as entries do it. `ResourceType` gains `'global'`
and loses `'setting'`.

Module layout mirrors entries: `globals/tables.ts`, `globals/service.ts`,
`globals/contract.ts`, `globals/schema.ts`, `globals/operations/{get,update,
status}.ts`, `globals/operations/versions/{list,restore}.ts`,
`globals/operations/staging/{create,get,merge,delete}.ts`,
`globals/repository/globals-table.ts`, `globals/internal/global.ts`
(`resolveGlobal`, `assertCapability`, the not-found and validation errors).
Errors: `GlobalNotFoundError`, `GlobalValidationError`, reusing
`CapabilityError`.

Exposure: `Astromech.globals` on the site handle, `ctx.globals` on
`PluginContext` (typed `TypedGlobalsService`, unscoped, addressed by qualified
key, as `ctx.entries` is), `CORE_SERVICES.globals` in tool dispatch,
`scopeMethods(globalsService, globalsContract)` in policies, and
`['globals', globalsContract]` in `buildCoreMethods`.

### Permissions

Derived per global, exactly as entry permissions are, from
`permissions/global-permission.ts`: `global:<key>:<action>` for a host global,
`plugin:<ns>:global:<key>:<action>` for a plugin's, with actions `read`,
`update`, `publish`. `globalPermissions(key, ...actions)` is exported beside
`entryPermissions`. The catalogue gains source `'global'`, offering `publish`
under the same gate the entry catalogue applies. The roadmap defers
per-global permission *design*; this is the derivation entries already have,
chosen over a coarse `globals:read`/`globals:update` pair that the deferred
work would have to replace. `settings:read` and `settings:update` stay, now
gating only the KV class.

### The shared content repository

Entries and globals persist through one implementation over
`{ table, contentTable, versionsTable }`. It lives in a new shelf module,
`packages/astromech/src/content/`, named for the `Content` term in
`TERMINOLOGY.md` (one locale of a resource's authored values). It imports
`database/` and `fields/` and nothing above; `entries/` and `globals/` import
it. ("The content modules" in `ARCHITECTURE.md` is a different use of the
word and is left as is.)

```ts
// content/repository/types.ts
type ContentShape = {
    table: Table;
    contentTable: Table;
    versionsTable: Table;
    /** The content table's FK column to the resource row: `entryId`, `globalId`. */
    ownerColumn: string;
};

type ContentRowId = string & { readonly __brand: 'ContentRowId' };
type ContentRef = { id: string; locale?: string | undefined };

/** What every resource's content read carries. */
type ContentRow = {
    id: string;
    contentId: ContentRowId;
    locale: string;
    locales: string[];
    staged: boolean;
    fields: JsonObject;
    status?: EntryStatus;
    publishedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string | null;
    updatedBy?: string | null;
};

type ContentWrite = {
    fields?: JsonObject;
    status?: EntryStatus;
    publishedAt?: Date | null;
    locale?: string;
    createdBy?: string | null;
    updatedBy?: string | null;
    /** Resource-specific content columns (`title`, `slug`), passed through. */
    [column: string]: unknown;
};

type ContentRepository<R extends ContentRow> = {
    get(ref: ContentRef, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    anyLocale(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    /** Insert the resource row (`own` columns) and its first content row. */
    create(own: Record<string, unknown>, content: ContentWrite): Promise<R>;
    update(ref: ContentRef, data: ContentWrite): Promise<R>;
    delete(id: string): Promise<void>;
    locales(ids: string[]): Promise<Map<string, string[]>>;
    translatable: { siblings; propagateFields }; // as on EntryRepository today
    staging: { getByCanonical; create; update; delete };
    versions: { list; get; create; latestNumber }; // snapshot = { contentId, version, fields, createdBy, ...extra }
};

function createContentRepository<R extends ContentRow>(
    shape: ContentShape,
    opts: {
        db?: Db;
        defaultLocale?: string;
        /** Decode a joined row into R; the resource adds its own columns. */
        decode: (own: Record<string, unknown>, content: Record<string, unknown>) => R;
        /** Extra predicate on the resource row, e.g. entries' `deletedAt IS NULL`. */
        ownerFilter?: (qb, opts: { includeTrashed?: boolean }) => qb;
    }
): ContentRepository<R>;
```

It addresses tables through the shape (dynamic Kysely references, encoded and
decoded through the `Table` codecs), so the shape is data, not generics, and
no SQL outside `content/repository/` and the two resource repositories names
`entry_content` or `global_content`. `createEntriesTableRepository` becomes a
composition: the shared repository plus `list`, `uniqueSlug`, `trash`,
`previewToken`, `existingIds` and the relationship-aware `where`, all of which
stay in `entries/repository/entries-table.ts`. `createGlobalsRepository` is
the shared repository plus `idByKey(key)`. `entries/repository/types.ts` keeps
`EntryRow = ContentRow & { type?; title?; slug?; deletedAt? }`, `EntryRef =
ContentRef`, and re-exports `ContentRowId`; `EntryRepository` is unchanged in
shape so `tableRepository` and the registry do not move. `versions.ts` moves
into `content/repository/` as the shared versions group.

The operation helpers globals also need move to `content/` and are
parameterized over `ContentRow` and a field-definition list rather than an
entry type: `inheritSharedFields` and `propagateSharedFields`
(`content/translatable.ts`), `snapshotVersion` and
`changesVersionedContent` (`content/versions.ts`), and `mergePatch`. What is
entries-only (`stored-fields.ts`'s slug and title handling, relationship
pruning, `entry-type.ts`) stays in `entries/internal/`. Chunk 1 is
behaviour-preserving for entries: the existing entries tests pass unchanged.

### Transport

Routes are mounted at `/globals` and mirror the entries subpaths for the same
methods, with `:key` where entries have `:type/:id` and a qualified key
encoded the way a qualified entry type is:

| verb   | path                                 | method                  |
| ------ | ------------------------------------ | ----------------------- |
| get    | `/:key`                              | `globals.get` (bespoke: public branch, 404 on null) |
| put    | `/:key`                              | `globals.update`        |
| post   | `/:key/publish`                      | `globals.publish`       |
| post   | `/:key/unpublish`                    | `globals.unpublish`     |
| post   | `/:key/schedule`                     | `globals.schedule`      |
| get    | `/:key/versions`                     | `globals.versions`      |
| post   | `/:key/versions/:versionId/restore`  | `globals.restoreVersion` |
| post   | `/:key/staged`                       | `globals.createStaged`  |
| get    | `/:key/staged`                       | `globals.getStaged`     |
| post   | `/:key/staged/merge`                 | `globals.mergeStaged`   |
| delete | `/:key/staged`                       | `globals.deleteStaged`  |

The client gains `restService<GlobalsService>('globals')`; its `settings.get`
loses the concurrent `key:locale` fetch and the `locale` option. The settings
routes keep `GET /`, `PUT /:key`, `GET /:key`; `settingsService.set` drops the
page lookup and field validation. `transport/cli/validate-stored-content.ts`
reports on globals (through `globalsService`) instead of settings blobs. No
globals-specific CLI command; `astromech call globals.get` reaches it as it
reaches every method. MCP tools and OpenAPI follow from the manifest and route
specs.

### Admin

- **Nav.** `sidebar.tsx` gains a "Globals" block after the entry types,
  listing `adminConfig.globals` where `nav` is true and the user holds the
  read permission. Plugin globals appear in the plugin's tree. The host pages
  block keeps only component pages.
- **Routes.** `_protected/globals/$key/index.tsx`,
  `_protected/globals/$key/versions.tsx`,
  `_protected/plugin/$name/globals/$key/index.tsx` and its `versions.tsx`.
  Search params: `locale`, `staged`. `page/$.tsx` and `plugin/$.tsx` render
  `ComponentPageView` only.
- **Mount.** `admin/components/globals/mount.ts`: `GlobalsMount = { api:
  GlobalsService, key, cacheScope, config: AdminGlobal | undefined, basePath,
  permissionFor: (action: 'read' | 'update' | 'publish') => string }`, with
  `buildPluginGlobalsMount` as for entries.
- **Edit page.** `admin/components/globals/global-edit-page.tsx` composes the
  entry building blocks rather than copying them: `EntryFieldColumn`,
  `PublishPanel`, `LocaleSwitcher`, `EntryFormErrors`, the field providers and
  `useEntryForm`, plus the staged-change controls the entry edit page offers
  (create staged, edit staged, merge, discard). No breadcrumb list link, no
  delete, no duplicate, no preview token. The `LocaleSwitcher`'s `entryId`
  prop is renamed `id`; the switcher changes the `locale` search param and
  keeps the key. A `null` from `get` renders an empty form; saving it is the
  first `update`.
- **Versions page.** `entry-versions-page.tsx` is split so its list and
  restore UI take a mount-shaped parameter and a `versions`/`restoreVersion`
  pair; `global-versions-page.tsx` reuses it.
- **Deleted.** `settings-page-form.tsx`, `settings-page-save.ts`,
  `settings/page-values.shared.ts`, `admin/utilities` helpers used only by
  them, and the `canReadSettings`/`canUpdateSettings` page gate in favour of
  the per-global permission.

### Plugins and demo

- **seo**: `globals: [defineGlobal({ key: 'settings', ... })]`; reads
  `ctx.globals.get({ key: \`${ctx.plugin.namespace}/settings\` })`.
- **backups**: the same, and `resolveKeep` reads through `ctx.globals` with
  the qualified key built from `namespace` (today it uses
  `permissionNamespace`).
- **menus**: `buildMenuGlobals(configs)` replaces `buildMenuPages`, one
  translatable global per menu at key `menus/<key>`; `service/menus.ts` reads
  `ctx.globals.get({ key, locale })` and the tree comes back as `fields.items`.
- **Demo**: `globals: [defineGlobal({ key: 'site', label: 'Site', icon:
  'Globe', translatable: true, public: true, fields: <the current globals page
  tree> })]`; `admin.pages` keeps `site-status`. `Site.astro` reads
  `app.globals.get({ key: 'site', locale })` and keeps its null fallback.
  `seed.ts` writes the `en` and `fr` rows through `globals.update` and
  publishes them; `upsertSetting` calls for `globals*` go. The rating plugin's
  settings page becomes a global.
- **Docs**: `apps/docs/content/globals.md`, a reference page: declaring a
  global, reading it from a site and a plugin, translation, versions,
  publishing, staging, `public`.

## Migration

`apps/demo` gets `0002_globals` from `db:generate`, pure DDL, plus the
regenerated `snapshot.json` and `journal.json`. `apps/demo-cloudflare` gets the
same three `CREATE TABLE` and index statements hand-applied to
`0000_migration.ts` after `entry_versions`, and its `snapshot.json` updated.
The drift test covers the rest.

## Chunks

Each chunk is one commit on `feat/resource-surface-globals`, in a worktree at
`../Astromech-worktrees/feat/resource-surface-globals`. A chunk's own tests
pass at its commit; the package typechecks from chunk 1 onward; `pnpm run
verify` passes from chunk 4 onward and before merge.

1. **Shared content repository and storage.** `content/repository/*`,
   `content/{translatable,versions}.ts`; `entries/repository/{types,
   entries-table,versions}.ts` and `entries/internal/*` recomposed over it
   with entries tests unchanged and green; `globals/tables.ts`,
   `database/tables.ts`, `database/types.ts`; both migrations and snapshots;
   `tests/db/drift.test.ts`; new `tests/content/repository/*` exercising the
   shared repository against the globals shape.
2. **Config and permissions.** `types/config.ts`, `config/{define-global,
   globals,plugin-globals,admin-config,admin-pages,resolve}.ts`,
   `types/plugins.ts`, `permissions/{global-permission,catalogue}.ts`,
   `codegen/type-generator.ts` and goldens, `AdminPage` shrink; `tests/config/*`,
   `tests/permissions/*`, `tests/codegen/*`.
3. **Globals module and settings shrink.** `globals/*`, `types/{domain,
   services,hooks,typed-globals}.ts`, `ctx.globals`, `Astromech.globals`,
   policies, tool dispatch, method manifest; `settings/service.ts` down to KV,
   `config/public-settings.ts`; `tests/services/globals/*`,
   `tests/services/settings/*`.
4. **Transport.** Route specs, `routes/globals.ts`, `routes/settings.ts`,
   client, `validate-stored-content.ts`, OpenAPI; `tests/transport/*`.
5. **Admin.** `admin/components/globals/*`, the four route files,
   `sidebar.tsx`, `locale-switcher.tsx`, `entry-versions-page.tsx` split,
   `page/$.tsx`, `plugin/$.tsx`, the deletions; `tests/admin/*`.
6. **Plugins, demo, docs.** seo, backups, menus, the demo config, seed,
   `Site.astro` and rating plugin; `TERMINOLOGY.md` (`Global`, `Resource`,
   `Module`), `DECISIONS.md` (the word, `key` and the array shape, the settings
   entry rewritten, `resource` under Reserved words), `ARCHITECTURE.md` (the `content/` shelf module and
   the fields paragraph), `apps/docs/content/globals.md`,
   `roadmap/planned/settings-version-history.md` moved to `completed/` with a
   closing line; tick the globals checkbox; full `verify`, `check:boot`,
   `check:boot:cloudflare`.

Chunks 4 and 5 touch disjoint files and run in parallel after chunk 3.
