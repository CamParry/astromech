# Authoring a plugin

A plugin is **one package** that extends Astromech — with custom field types,
admin pages, admin slots, permissions, service methods, hooks, entry types, or
database tables.
A plugin is mostly **declarative data**: you describe what it adds, and
Astromech wires it in.

The bundled `@astromech/redirects` and `@astromech/seo` plugins are good
worked examples to read alongside this guide.

## The shape of a plugin

A plugin is a **factory** created with `definePlugin`, from one object —
identity and behaviour together, the way `defineConfig` takes one config.
Pass a plain definition, or a factory when the plugin takes options. Either
way the result is a factory, so a site always calls it:

```ts
import { definePlugin } from 'astromech';

export const myPlugin = definePlugin({
    package: 'my-plugin', // canonical name — survives renames
    version: '1.0.0',
    label: 'My Plugin', // admin sidebar group + page-title prefix
    icon: 'Puzzle', // Lucide icon name
    // ...surfaces...
});

export default myPlugin;
```

`package` is a key like any other, so a plugin never has to hand its own
identity to itself — nothing inside the package needs to import an identity
module to build a namespaced string.

Register it in your config (plugins load in array order):

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { myPlugin } from 'my-plugin';

export default defineConfig({
    plugins: [myPlugin()],
});
```

## File layout

Keep `index.ts` thin — it composes modules, it doesn't define them. A
plugin's sub-modules must **not** import its identity: everything a
sub-module needs is either a relative fact it declares itself (a bare
permission key, a relative component path, a bare table name) or something it
reads off `ctx.plugin` at runtime. That's what keeps the package acyclic —
nothing has to reach back into `index.ts`.

```
my-plugin/
  index.ts               definePlugin() — identity + composing the surfaces below
  types.ts                domain constants (and a <X>_PACKAGE literal, if you have tables)
  tables/widgets.ts      one file per database table (definePluginTable)
  migrations/            generated — never hand-edited
  entries/               entry-type definitions, one per file
  globals/               global definitions (defineGlobal), one per file
  fields/                custom field-type registrations
  pages/                 admin page registrations
  helpers/               plugin helpers a site calls in its config
  permissions/           definePermissions() — the grantable permission keys
  service/               service-method definitions (defineServiceMethod)
  hooks/                 defineHook subscribers, and your own event names
  routes/                raw HTTP routes — the streaming/binary escape hatch
  utilities/             pure helpers shared across the above
  admin/
    fields/              field renderers (.tsx)
    pages/               page renderers (.tsx)
    slots/               slot renderers (.tsx)
  locales/               i18n bundles (en.json, ...)
  README.md
```

Only include what you use.

Each directory holds the thing it is named after and nothing else — `tables/`
holds `definePluginTable` tables, `service/` holds service-method definitions. When a
method grows a loader or a formatter, that helper belongs in `utilities/`, not
beside the definition. A trivial single-use guard can stay inline; the rule is
about what a directory is _for_.

Within a file, put the main export first and its private helpers below it.
Function declarations hoist, so nothing has to be defined before it is used.

Every plugin ships a `README.md`: what it does, how to install it, its options,
and its public surface.

### The namespace

`package` is the **only** identifier you declare. Everything else — table
prefix, permission namespace, i18n namespace, HTTP route segment, service key —
derives from it mechanically. There is no `name`, no `alias`, and no
site-level override: a plugin's table names are baked into its shipped
migration SQL, so nothing an override could move actually moves.

The derivation, in order: `@astromech/*` packages strip their scope; everything
else drops the leading `@` and keeps its scope; then lowercase, and `/` and `-`
become `_`.

| package                   | namespace                | service key           |
| ------------------------- | ------------------------ | --------------------- |
| `@astromech/redirects`    | `redirects`              | `redirects`           |
| `@acme/seo`               | `acme_seo`               | `acmeSeo`             |
| `acme-seo` (unscoped)     | `acme_seo`               | `acmeSeo`             |
| `@acme-digital/seo-tools` | `acme_digital_seo_tools` | `acmeDigitalSeoTools` |

The two forms split cleanly by audience:

- **namespace** — everything that lives in your database or your permission
  strings: `plugin_acme_seo_settings`, `plugin:acme_seo:read`, a global's
  qualified key `acme_seo/settings`, the i18n bundle
  key, and the admin URL `/cms/plugin/acme_seo/*`.
- **service key** — everything an API caller says: `Astromech.plugins.acmeSeo`
  and the matching route, `POST /cms/api/plugins/acmeSeo/*`. Both transports use it,
  so the property you write is the segment that goes on the wire.

Derivation runs one way only — `package` → namespace → service key. Nothing
inverts it, and neither should your code: if you have one form and need
another, read both off the identity rather than transforming the string. Both
steps are lossy, so a reverse transform is a guess. At runtime, read it off
`ctx.plugin` (`package`, `namespace`, `serviceKey`, `permissionNamespace`)
rather than deriving it yourself — see [Runtime identity](#runtime-identity)
below. In a site's config there is no `ctx`, and a
[plugin helper](#plugin-helpers) receives the same identity as its first
argument.

Which is why a collision on either form is a hard install error. npm already
guarantees package names are unique, so you can only hit it via one of the lossy
steps: `@acme/seo` vs unscoped `acme-seo` (same namespace), or `@acme/2fa` vs
`acme2fa` (same service key). There is no way to resolve it site-side; one of
the packages has to be renamed by its author.

**Identifier length.** Emitted index and constraint names are capped at 63 bytes
(Postgres' limit) with a deterministic hash suffix. Table names are never
truncated — an over-long one is a generate-time error — so budget
`plugin_` + namespace + `_` + table ≤ 63 characters.

## Asset paths

Component and locale paths on `fields`, `admin.pages`, `admin.slots` and
`i18n` are plain **relative import-specifier strings** — Astromech loads them
lazily, and resolves each one against the definition's `root`:

```ts
// fields/rating.ts
import type { PluginFieldType } from 'astromech';

export const ratingField: PluginFieldType = {
    type: 'rating',
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0,
    tsType: () => 'number',
};
```

The rule: if `root` is a `file:` URL, a relative specifier resolves to an
absolute path against it. Otherwise it resolves to `<root ?? package>/<path>`
— the subpath a published package exports the asset under. Absolute and bare
specifiers pass through untouched, so an asset from another package can still
be named directly.

In practice that means two shapes:

- **A published package** omits `root` entirely, and a specifier such as
  `'./admin/pages/overview-page.tsx'` resolves to
  `@astromech/seo/admin/pages/overview-page.tsx` — the exports subpath the
  package ships that file under.
- **An in-tree or otherwise unpublished plugin** — one with no package
  specifier to resolve through — passes `root: import.meta.url`, and the same
  specifier resolves to an absolute path next to that file:

    ```ts
    export const rating = definePlugin({
        package: 'demo-rating',
        root: import.meta.url,
        fields: [ratingField],
        // ...
    });
    ```

Component `.tsx` files live under `src/admin/{fields,pages,slots}/`; the
registration modules that reference them (`fields/rating.ts`,
`pages/overview.ts`) stay outside `admin/`, since only the React renderer
itself is a browser asset.

### i18n

`i18n` is usually just the locale codes:

```ts
i18n: ['en', 'fr'],
```

which expands to `./locales/en.json`, `./locales/fr.json` and resolves like
any other asset. Pass a `{ locale: specifier }` map instead when the bundles
don't follow that layout.

## Surfaces

### Custom field types

A plugin field type is a `FieldType`, the same record behind every core type,
plus the `component` that renders it in the admin. Core registers it when the
config resolves, so the server coerces, defaults and validates its values on
every write, and codegen, public reads and the relationships index handle it
like a core type.

```ts
// fields/rating.ts
import type { PluginFieldType } from 'astromech';

export const ratingField: PluginFieldType = {
    type: 'rating', // build error if it collides
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0, // a missing value on create
    tsType: () => 'number', // generated Fields types; JsonValue when omitted
    coerce: (value) => (typeof value === 'string' ? Number(value) : value),
    validate: async ({ value }) =>
        typeof value === 'number' && value >= 0 && value <= 5
            ? true
            : 'Rating must be between 0 and 5',
};
```

The other members, all optional:

| Member        | Does                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `affectsData` | `false` for a field that stores nothing, such as a preview. Data paths skip it; the admin still renders it. |
| `isRelation`  | The value is an id or a list of ids the relationships index records.                                        |
| `toPublic`    | The value a public read returns, as rich text returns HTML.                                                 |
| `children`    | A container's nested value scopes, so parsing and public reads recurse into it.                             |
| `subFields`   | A container's declared field lists, so config validation and relationship paths reach them.                 |

A container's `tsType` receives a third argument, `emit`: `emit.properties(fields)`
types a nested scope, and `emit.alias(name, body)` declares a named type for a
value that refers to itself.

The renderer **default-exports** a component taking `BaseFieldProps`, and may
also export `validate(value, field)`, which the admin runs as the value changes.
Share the check with the field type's `validate` so the two agree:

```tsx
// admin/fields/rating-field.tsx
import type { BaseFieldProps } from 'astromech';

export default function RatingField({ name, value, onChange, disabled }: BaseFieldProps) {
    /* ... */
}

export function validate(value: unknown): string | undefined {
    /* ... */
}
```

Then reference it anywhere a field is declared: `{ name: 'quality', type: 'rating' }`.
A field whose type has `affectsData: false` still takes a name, which the admin
uses as its key; nothing is stored under it.

### Running the field pipeline yourself

A plugin that accepts values against field definitions it holds — a public form
submission, an import, anything not going through `ctx.entries` — runs the same
pipeline the core write paths run, from `astromech/fields`:

```ts
import { safeParseFields } from 'astromech/fields';

const { values, errors } = await safeParseFields(input, definitions, {
    operation: 'create',
    resource: { kind: 'entry', record: null },
    user: ctx.user,
    isUnique: async () => true,
});
if (Object.keys(errors).length > 0) return { ok: false, errors };
```

Two shapes, named on Zod's convention. **`parseFields`** returns the coerced
values and throws a 422 when anything reported: use it when a failure should
abort the write. **`safeParseFields`** returns `{ values, errors, warnings, form }`
instead: use it when you want to hand the messages back to a caller, as a form
submission does. Both coerce values and apply defaults as well as check them,
so the `values` they return are what you store — not the input you passed in.

`isUnique` and `entryTypes` are how the data-backed rules read: `unique` needs to
scan existing rows, and a relationship's target-type check needs to resolve ids.
An `isUnique` that reads nothing, with `entryTypes` left out, makes both checks
pass silently, which is the right trade for an unauthenticated submission and
the wrong one for an import.
`apps/docs/content/field-validation.md` covers what each rule checks and when.

### Admin pages

A page appears in the sidebar (unless it sets `nav: false`) and renders a React
component named by `component`. A field-bearing destination is a global, not a
page — see [content/globals.md](../content/globals.md).

```ts
// pages/overview.ts
import { defineAdminPage } from 'astromech';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'ChartBar',
    component: './admin/pages/overview-page.tsx',
    permission: 'read', // a bare key → plugin:<namespace>:read
});
```

#### Where a page ends up

`defineAdminPage` is one helper for both origins — a host app's `admin.pages`
and a plugin's `admin.pages` take the same object. **The registration site
decides the scoping, not the name of the helper**, so what you declare is a
**bare `path`** and Astromech absolutizes it wherever it was registered:

| declared in     | route                           | default permission |
| --------------- | ------------------------------- | ------------------ |
| a plugin        | `/cms/plugin/<namespace><path>` | none               |
| the host config | `/cms/page/<path>`              | none               |

A `component` specifier is resolved relative to the **plugin's `root`** for a
plugin page and relative to the **Astro project root** for a host page — so a
host page writes `component: './src/admin/pages/site-status.tsx'`, the path as
it appears in the repo. A non-relative specifier passes through untouched in
both cases, so a page component can come from a package subpath. Host page
components must **not** call `useAstromechPlugin()`: there is no plugin identity
to provide and the hook throws. Use the `astromech/ui` primitives directly.

Plugin paths lead with a `/` (`'/overview'` → `/cms/plugin/seo/overview`);
`path: ''` is legal and mounts the page at the plugin's root,
`/cms/plugin/backups`. Host paths don't (`path: 'site-status'` →
`/cms/page/site-status`), because the host route already supplies the separator.

**Do not namespace the path yourself.** A declaration is relative by design and
there is no double-prefix guard — writing `path: '/myplugin/overview'` inside
`@acme/myplugin` gets you `/cms/plugin/myplugin/myplugin/overview`. The same rule holds for
`permission`, which takes a bare key (`'read'` → `plugin:<namespace>:read`).

Page components call `useAstromechPlugin()` (from `astromech/ui/app`) for context:

```tsx
// admin/pages/overview-page.tsx
import { useAstromechPlugin } from 'astromech/ui/app';

export default function OverviewPage() {
    const { plugin, currentUser, toast, t } = useAstromechPlugin();
    // ...
}
```

#### A list of your own records

`useListState()` and `<DataList>`, from `astromech/ui`, give a page the list
the entry and user screens use. They take rows and callbacks, so they work over
whatever your service methods return.

- `useListState({ pageSize })` reads the search text (`q`), the sort and the
  page from the URL, and returns them with the `limit` and `offset` to fetch.
  Its setters (`setQuery`, `setSort`, `setPage`, `setFilters`) write the URL,
  and a change to the search, the sort or a filter returns to the first page.
- `<DataList>` renders the toolbar, the table, pagination, and the loading,
  error and empty states. A column is `{ key, label, sortable?, link?, render }`.
  `rowHref` makes a click anywhere in the row open it, and `link` makes that
  column's cell the link a keyboard reaches. `rowActions` returns a row's menu.
  `bulkActions` adds row selection: each is `{ label, run(ids), tone? }`, and a
  `tone: 'danger'` action asks before it runs.

```tsx
// admin/pages/redirects-page.tsx
import { useQuery } from '@tanstack/react-query';
import { DataList, useListState } from 'astromech/ui';
import { useAstromechPlugin } from 'astromech/ui/app';

type Redirect = { id: string; from: string; to: string; statusCode: number };
type RedirectsService = {
    list(params: { search: string; limit: number; offset: number }): Promise<{
        rows: Redirect[];
        pages: number;
    }>;
    delete(params: { ids: string[] }): Promise<void>;
};

export default function RedirectsPage() {
    const { service } = useAstromechPlugin();
    const redirects = service as RedirectsService;
    const list = useListState({ pageSize: 20 });
    const { data, isLoading, isError } = useQuery({
        queryKey: ['redirects', list.q, list.page],
        queryFn: () =>
            redirects.list({ search: list.q, limit: list.limit, offset: list.offset }),
    });

    return (
        <DataList<Redirect>
            rows={data?.rows ?? []}
            columns={[
                { key: 'from', label: 'From', link: true, render: (row) => row.from },
                { key: 'to', label: 'To', render: (row) => row.to },
                { key: 'statusCode', label: 'Status', render: (row) => row.statusCode },
            ]}
            isLoading={isLoading}
            isError={isError}
            search={list.q}
            onSearch={list.setQuery}
            page={list.page}
            pages={data?.pages ?? 1}
            onPage={list.setPage}
            rowHref={(row) => `/plugin/redirects/${row.id}`}
            bulkActions={[
                {
                    label: 'Delete',
                    tone: 'danger',
                    run: (ids) => redirects.delete({ ids }),
                },
            ]}
        />
    );
}
```

#### A form over your own records

`useFieldsForm` and `<FieldsForm>`, also from `astromech/ui/app`, give a page
the form the entry and user screens use, over field definitions you hold. The
hook takes the definitions, the `operation` (`'create'` or `'update'`), the
`defaultValues`, an `onSubmit` that writes and resolves to the saved record, and
the `namespace` labels resolve against. It runs the field pipeline before a
submit goes out. When `onSubmit` rejects with a 422, it puts each message in
the error's `details.fields` on the field it names and shows `details.form` in a
banner above the form. It also saves on Cmd+S, and asks before a tab with
unsaved changes closes.

```tsx
// admin/pages/redirect-form.tsx
import { Button } from 'astromech/ui';
import { FieldsForm, useAstromechPlugin, useFieldsForm } from 'astromech/ui/app';
import { redirectFields } from '../../fields/redirect';

type Redirect = { id: string; from: string; to: string; statusCode: number };
type RedirectsService = {
    update(params: { id: string; data: Record<string, unknown> }): Promise<Redirect>;
};

export function RedirectForm({ redirect }: { redirect: Redirect }) {
    const { plugin, service } = useAstromechPlugin();
    const redirects = service as RedirectsService;
    const { id, ...values } = redirect;

    const form = useFieldsForm({
        fieldDefinitions: redirectFields,
        operation: 'update',
        namespace: plugin,
        defaultValues: { fields: values },
        onSubmit: ({ fields }) => redirects.update({ id, data: fields }),
    });

    return (
        <FieldsForm
            form={form}
            sidebar={<Button onClick={() => form.handleSubmit()}>Save</Button>}
        />
    );
}
```

The field values sit under `fields`. A key the form edits outside the field
definitions, such as a user's `email`, sits beside `fields` in `defaultValues`,
and a control binds to it through `form.form.Field`, TanStack Form's own
component. `<FieldsForm>` renders every field in its main column unless you
pass `main`; to place a run of fields yourself, use
`<FieldColumn form={form} fields={…} />`. Pass `readOnly: true` to render every
field disabled and make `handleSubmit` do nothing, as for a record your service
cannot update.

### Globals

A plugin's editor-owned, exactly-one values are globals, declared in a
`globals` array on the definition and addressed at runtime by the qualified key
`<namespace>/<key>`:

```ts
// globals/settings.ts
export const settingsGlobal = defineGlobal({
    key: 'settings',
    label: 'Settings',
    icon: 'Settings',
    fields: [fields.boolean('showInListing', { label: 'Show ratings in lists' })],
});
```

Astromech mounts it at `/cms/plugin/<namespace>/globals/<key>`, derives
`plugin:<namespace>:global:<key>:<action>` permissions for it, and lists it in
the plugin's nav tree. [content/globals.md](../content/globals.md) covers every
option and how to read one back.

### Admin slots

Slots mount **persistent chrome** into the admin shell — UI that lives outside
any single page. Three named slots are available:

- `toolbar` — actions in the top bar, beside notifications and the theme toggle
- `right-drawer` — a docked panel beside the page content
- `global-overlay` — a free-floating layer over the whole shell (the component
  owns its own positioning/portal)

Declare contributions under `admin.slots`. Each names a slot and a lazily
loaded `component`. `order` sorts within a slot (ascending, default 0) and a
bare `permission` key gates visibility (`plugin:<namespace>:<key>`).

```ts
// in the plugin definition
admin: {
    slots: [
        { slot: 'toolbar', component: './admin/slots/assistant-button.tsx' },
        {
            slot: 'global-overlay',
            component: './admin/slots/assistant-panel.tsx',
            permission: 'use',
        },
    ],
},
```

Slot components call `useAstromechPlugin()` for context, exactly like page
components. An empty slot renders nothing. Cross-slot coordination (e.g. a
toolbar button toggling an overlay) is the plugin's own concern — share state
through a module both contributions import.

### Packages your admin components import

List every package your pages, slots and field components import under
`admin.optimizeDeps.include`, so the site's Vite pre-bundles it when the dev
server starts. Without the list, the dev server finds the package on first
load and reloads the page, and in a site installed from npm the import may not
resolve at all.

```ts
// in the plugin definition
admin: {
    slots: [
        { slot: 'right-drawer', component: './admin/slots/chat-drawer.tsx' },
    ],
    optimizeDeps: { include: ['react-markdown', 'remark-gfm'] },
},
```

Each entry must be in your package's `dependencies` or `peerDependencies`,
because Astromech resolves it through your package. A plugin with a `file:`
root resolves it from the site instead. Leave out `astromech` and its
subpaths, and `react`, `react-dom` and `react/jsx-runtime`, which the site
already provides.

### Permissions

Declare the permissions your plugin makes grantable with `definePermissions` —
one flat record of **bare** keys, each with the label a permissions matrix
shows. Core namespaces them to `plugin:<namespace>:<key>` at registration, so
you never write a prefix and never have to know one.

```ts
// permissions/rating.ts
import { definePermissions } from 'astromech';

export const ratingPermissions = definePermissions({
    read: {
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
});
```

```ts
// index.ts
permissions: ratingPermissions,
```

One declaration serves every consumer: the `astromech permissions` catalogue,
the grant accessor below, and any future permissions matrix in the admin.

A site reads permissions straight off the plugin factory, namespaced already.
The accessor is **variadic** — a role enumerates the keys it grants, because
enumeration is the point of an opt-in model:

```ts
// in a consumer's config
roles: {
    editor: {
        name: 'Editor',
        permissions: [...permissionsForBuiltInRole('editor'), ...myPlugin.permissions('read', 'export')],
    },
}
```

Keys are literal-typed, so `myPlugin.permissions('read')` type-checks and
`myPlugin.permissions('raed')` does not — and an unknown key throws at config
load rather than silently granting nothing. Calling `permissions()` with no
keys throws too.

**Keys must be one level deep.** A `:` anywhere in a key is a crash-loud error
at define time, because two rules turn a key into a permission string and they
disagree the moment a key contains a colon: route enforcement passes any string
containing `:` through unchanged, while the grant accessor prefixes
unconditionally. Forbidding `:` makes the two agree for every key that can
exist.

**Entry permissions are derived, never declared.** If your plugin contributes
entry types, core already generates `plugin:<ns>:entry:<type>:<action>` for
`read`, `create`, `update`, `delete` (and `publish`, for a versioned type) from
the registered type. Don't mirror them in `definePermissions` — a site grants
them from the qualified type id:

```ts
import { entryPermissions } from 'astromech';

...entryPermissions('redirects/redirect', 'read', 'create', 'update', 'delete');
```

**Nothing is auto-granted.** The `admin` role holds `*` and therefore already
has every permission any plugin will ever declare; every other role opts in
explicitly. If a role really should get everything one plugin offers, present
and future, `plugin:<namespace>:*` is the all-or-nothing escape hatch — but
naming the keys is the honest default.

### Plugin helpers

A function a site calls in its config, such as a field section to compose
into an entry type, belongs on your factory as a **plugin helper**. Declare it
under `helpers`, taking your plugin's resolved identity as its first parameter:

```ts
// helpers/section.ts
import type { Field, ResolvedPluginIdentity } from 'astromech';
import { t } from 'astromech';
import { group, text } from 'astromech/fields';

export function section(
    plugin: ResolvedPluginIdentity,
    options?: { label?: string }
): Field {
    return group('seo', {
        label: options?.label ?? t(`${plugin.namespace}:seo.sectionTitle`),
        fields: [text('title')],
    });
}
```

```ts
// index.ts
helpers: { section },
```

`definePlugin` supplies the identity, so a site passes only the rest:

```ts
fields: [fields.text('title'), seo.section({ label: 'Search' })],
```

A helper's parameters and return type carry through, so `seo.section` is typed
`(options?: { label?: string }) => Field`. The identity comes from the
definition your factory returns without options. A helper named after
something the factory already has, such as `permissions`, `name` or `call`,
throws when the plugin is defined.

### Database tables

A plugin that needs its own tables declares each with
`definePluginTable` from `astromech`, one file per table. It is
`defineTable` scoped to your plugin: you pass your package name and a bare
name, and it prefixes both the table and any index names with
`plugin_<namespace>_` so two plugins can never collide.

```ts
import type { TableSelect } from 'astromech';
import { definePluginTable } from 'astromech';
import { MY_PLUGIN_PACKAGE } from '../types.js';

// tables/widgets.ts

export const widgetsTable = definePluginTable(
    MY_PLUGIN_PACKAGE,
    'widgets',
    ({ col }) => ({
        id: col.id(),
        label: col.text({ notNull: true }),
        status: col.enum(['draft', 'live'], { notNull: true }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    }),
    ({ index }) => [index('idx_status', ['status'])]
);
// widgetsTable.name === 'plugin_acme_my_plugin_widgets'

export type WidgetRow = TableSelect<typeof widgetsTable>;
```

Name the export `<noun>Table` — `widgetsTable`, not `widgets`. The noun matches
the bare table name you passed, and the suffix keeps the table distinct
from the domain word and from anything at service altitude. Every table in
Astromech follows it: core's `entriesTable`, `mediaTable`, `cronTable`, and the
first-party plugins' `backupRunsTable`, `submissionsTable` and `redirectsTable`.
Row types keep their own convention (`WidgetRow`, `NewWidgetRow`).

`definePluginTable`'s first argument takes the package name as a **value** —
not read off the plugin's definition — because the prefix has to exist as a
_literal type_ for `PluginDB` to key on, and a value declared inside
`definePlugin` can't reach a module-scope table. So a plugin with tables
keeps its package name in a dependency-free leaf both `index.ts` and its
table modules can import:

```ts
// types.ts
export const MY_PLUGIN_PACKAGE = '@acme/my-plugin';
```

```ts
// index.ts
export const myPlugin = definePlugin({
    package: MY_PLUGIN_PACKAGE,
    tables: [widgetsTable],
    migrations: migrationProvider,
    // ...
});
```

This is the one place a plugin names its identity outside `index.ts` — every
other sub-module either declares a relative fact or reads `ctx.plugin` at
runtime.

`id` columns are ULIDs and timestamps are ISO-8601 TEXT, both filled from the
table — you never mint them yourself.

Your plugin owns its migrations. Generate them into the package, commit them,
and list the provider on the definition:

```sh
npx astromech plugin:generate --name baseline   # → migrations/0000_baseline.ts
```

```ts
import { migrationProvider } from '../migrations/index.js';
import { widgetsTable } from './tables/widgets.js';

export const myPlugin = definePlugin({
    package: MY_PLUGIN_PACKAGE,
    // ...
    tables: [widgetsTable],
    migrations: migrationProvider,
});
```

Migrations are generated, never hand-written: if the output is wrong, fix the
table and regenerate. The app merges every installed plugin's chain into
its own at apply time (under `plugin_<namespace>_`-prefixed names, in one shared
`kysely_migration` table), so `db:init` is all a consumer runs.

Installed plugins are tracked in `_astromech_plugins`. Removing a plugin from
`astromech.config.ts` leaves its tables behind on purpose — the app warns about
the orphan, and `npx astromech plugin:purge <package>` drops its tables,
migration rows and tracking row once you are sure. Purge takes the package name
(`@acme/seo`), not the namespace — at a destructive call site the canonical
identifier is the unambiguous one.

#### Typing the table on a site's handle

A site that queries your table through its own `db` handle, in a seed script
for example, sees it only if your package adds it. Add your tables to
`AstromechPluginTables` in `index.ts`, from the same array you pass to the
definition, so the tables are listed once:

```ts
// index.ts
import type { PluginDB } from 'astromech';
import { widgetsTable } from './tables/widgets.js';

const tables = [widgetsTable] as const;

declare module 'astromech' {
    interface AstromechPluginTables extends PluginDB<typeof tables> {}
}

export const myPlugin = definePlugin({
    package: MY_PLUGIN_PACKAGE,
    tables,
    // ...
});
```

`as const` keeps each table's type, name included. `PluginDB` keys each table
by its Kysely name, the camel-cased table name (`pluginAcmeMyPluginWidgets`),
which is why the package name has to be a literal type. Keep the block in
`index.ts`, or in a module it imports, so it ends up in your package's
published `.d.ts`. It applies wherever your package is in a site's program,
even if the site's config doesn't install the plugin.

#### Reading and writing the table

Don't query the table from your handlers. Give it a repository module —
`createRepository` from `astromech` turns a `Table` into typed
`findOne`/`findMany`/`pluck`/`count`/`create`/`createMany`/`update`/`delete`/`updateMany`/`deleteMany`/`upsert`,
and owns encoding, `where`-value serialization and row decoding, so nothing above
it spells the table name or touches a codec.

Compose it inside your own `createXRepository(db)` factory and pass it `ctx.db`,
the only database handle a plugin gets. Name the methods the way core does:
`findOne`, `findMany`, `findBy…` for reads, and `create`, `update`, `delete`
for writes.

```ts
// repository.ts
import type { WidgetRow } from './tables/widgets.js';
import type { PluginContext } from 'astromech';
import { createRepository } from 'astromech';
import { widgetsTable } from './tables/widgets.js';

export function createWidgetsRepository(db: PluginContext['db']) {
    const repository = createRepository(widgetsTable, db);

    async function findLive(limit: number): Promise<WidgetRow[]> {
        return repository.findMany({
            where: { status: 'live' },
            orderBy: [['createdAt', 'desc']],
            limit,
        });
    }

    return { findOne: (id: string) => repository.findOne({ id }), findLive };
}
```

```ts
// service/widgets.ts
const widgets = await createWidgetsRepository(ctx.db).findLive(20);
```

Build the repository inside the handler, not once at module level. `ctx.db` is
a getter that returns the open transaction's handle inside `transaction(fn)`, so
a repository built before the transaction opened keeps the outer handle and its
writes do not join.

`where` ANDs its keys together: a bare value means `=`, a bare `null` means
`IS NULL` (omit the key, or pass `undefined`, for "no filter"), and a per-column
object takes `eq`/`ne`/`in`/`notIn`/`gt`/`gte`/`lt`/`lte`/`like`/`contains`. An
unknown column name throws rather than being skipped, because a dropped predicate
returns too many rows.

`contains` is the one to reach for with user-supplied search text: it escapes
`%`, `_` and `\`, so a search for `100%` matches that literal text. `like` takes
a pattern and passes it through untouched.

`or` takes a list of full `where` clauses, OR-ed together and then ANDed with the
keys beside it. A branch is an ordinary `where`, so branches nest:

```ts
repository.findMany({
    where: {
        status: 'live',
        or: [{ title: { contains: search } }, { slug: { contains: search } }],
    },
});
```

There is no `and` — the keys of one clause already AND.

For what the DSL still cannot express — an aggregate, an expression filter —
`repository.kysely()` is the escape hatch. It hands back the Kysely handle, the
resolved table key, and the wrapper's own `where` compiler, so a mixed query ANDs
a raw clause onto the DSL filter in one statement instead of restating it:

```ts
const { db, table, where } = repository.kysely();
const rows = await db
    .selectFrom(table)
    .selectAll()
    .where((eb) => eb.and([where({ status: 'live' })(eb), rawClause(eb)]))
    .execute();
// kysely() hands out raw rows — decode them yourself.
const widgets = rows.map((row) => decodeWith(widgetsTable, row));
```

The name is literal on purpose. The DSL is the contract this repository keeps;
`kysely()` is a hole through it to the engine underneath, and carries no
compatibility promise.

That decoding is also what you want for a read or write that bypasses a repository
entirely: `decodeWith(widgetsTable, row)`,
`encodeWith(widgetsTable, values)`, `encodePatchWith(widgetsTable, patch)` — all
from `astromech`.

### Runtime identity

Hooks, service methods, cron handlers and `setup()` all receive a
`PluginContext`. A hook and a service method act as the caller that reached
them; a cron handler and `setup()` act as the system, with no user and no role.
The context carries the plugin's own resolved identity at
`ctx.plugin` — `package`, `namespace`, `serviceKey`, `permissionNamespace`, and
`version` if declared. Runtime code that needs a namespaced string reads it
from there instead of importing an identity module:

```ts
// backup.ts
export async function resolveKeep(ctx: PluginContext, fallback: number): Promise<number> {
    const global = await ctx.globals.get({
        key: `${ctx.plugin.namespace}/settings`,
        full: true,
    });
    const value = global?.fields['retention'];
    // ...
}
```

```ts
// menus/service/menus.ts
const global = await ctx.globals.get({
    key: `${ctx.plugin.namespace}/menu-${key}`,
    full: true,
});
```

`ctx.config` sits alongside it, and is a projection of the site's resolved
config rather than the whole of it: the route prefixes, `entryTypes` and
`globals` (the site's and every plugin's in one map each, keyed by id, each
carrying `plugin` when a plugin declares it), admin pages, locales, trash,
timezone, and `entryTypesWithField(name)` for the entry types carrying one of
your fields. `storage`, `email` and `media.image` are
absent, so reach those capabilities through the ports below rather than looking
for a driver on the config.

### Capability ports

Three platform capabilities reach you as ports on the context, each already
scoped to your plugin. You never see the driver the site configured, and you never
name the backend.

**`ctx.storage`** — blob storage, with every key transparently prefixed
`plugin/<alias>/`. `put(key, body, { contentType? })`, `get(key)`,
`list(prefix?)`, `delete(key)`. `list()` hands back de-prefixed keys, so the
strings you put in are the strings you get out:

```ts
await ctx.storage.put('exports/latest.json', bytes, { contentType: 'application/json' });
const object = await ctx.storage.get('exports/latest.json');
```

**`ctx.email`** — `send(to, subject, element)`. Pass a React element; `send`
renders it to html and text. The envelope sender is the one the site configured on
its email driver. A site with no email driver at all makes this throw, so catch it
where sending is optional to your plugin:

```tsx
await ctx.email.send(user.email, 'Your export is ready', <ExportReady url={url} />);
```

**`ctx.database`** — `{ dialect, dump?, restore? }`, for maintenance work rather
than queries (`ctx.db` is the query handle). `dump` and `restore` are optional and
depend on the site's database driver, so check for them rather than switching on
`dialect`:

```ts
if (!ctx.database.dump) throw new Error('This database cannot be dumped');
const { stream, cleanup } = await ctx.database.dump();
try {
    await ctx.storage.put('snapshot.sqlite', stream);
} finally {
    await cleanup();
}
```

### Reaching the content services

The content services sit directly on the context — `ctx.entries`, `ctx.globals`,
`ctx.media`, `ctx.users`, `ctx.notifications`, `ctx.plugins` — and each is
the **global** service, not a per-plugin view. Reads answer the public shape,
as they do for a site's own code: an unpublished, scheduled or trashed entry is
not returned, and private fields are stripped. Pass `full: true` where the
plugin reads its own data (its settings global, its own entry types) and needs
all of it.

`ctx.notifications` is the exception: it acts on the signed-in user's own rows,
so it throws when the context has no user (a cron tick, a boot-time `setup()`).
Use `ctx.notify` to send a notification, which names its recipients and needs no
session.

`ctx.entries` therefore addresses a plugin's own entry types by their qualified
id, built from context rather than from an identity import:

```ts
const { data } = await ctx.entries.query({
    type: `${ctx.plugin.namespace}/redirect`,
    limit: 'all',
});
```

The same id is what the HTTP API and `Astromech.entries` use, so there is one
way to name an entry type everywhere. An unregistered type is rejected on
write rather than silently stored.

#### Calling as the caller, not as the plugin

`ctx.entries` and its siblings run as the **plugin**: no permission checks, and
`full`-wrapped by default. For a model-driven or otherwise untrusted call path —
anything acting on behalf of a caller rather than as the plugin itself — you
want the caller's permissions instead. `ctx.methods.tools()` is that surface:

```ts
const tools = ctx.methods.tools({ readOnly: true });
```

It returns every method the current request's role may call, each already
resolved into a tool definition that runs under that role — `{ id, name,
description, inputSchema, annotations, permission, permissionDynamic,
confirmMessage, invoke }`. `invoke` refuses what the role does not hold, and
`readOnly` drops every mutating method structurally rather than advising against
it. Wrap each one in whatever your model SDK's tool shape is and call `invoke`
from its handler. `ctx.role` is the role all of this is checked against: the
caller's role, or `null` for the system (a cron tick, a boot-time `setup()`).

Two fields are easy to skip past. `id` is the manifest method id (`entries.page.publish`)
and is the only key you may index a tool on — `name` is not unique, because
`entries.create` is the name of every entry type's create. `confirmMessage(args)`
returns the question to put to a human before running that method with those
arguments; core owns the wording so a plugin pausing on a mutating call doesn't
invent its own. `@astromech/assistant` builds its approve/reject panel from it.

Plugin-declared methods are in the list too, each checked against its declared
`access` for that role.

> **Reach core's services through `ctx`, not an import.** A method runs as the
> context it is given, and `ctx` is that context for your plugin: the caller,
> your identity and your storage. Your config is also loaded twice: in the
> running server's module graph, and in plain Node at config time, where
> `virtual:` modules do not exist. Your plugin's entry is loaded both times, so
> it imports only subpaths that load in plain Node, such as `astromech`,
> `astromech/fields`, `astromech/columns`, `astromech/email` and `astromech/ui`.
> `astromech/ui/app` reaches `virtual:` modules and throws
> `ERR_UNSUPPORTED_ESM_URL_SCHEME` there, so only your source-shipped
> `./admin/*` components import it. Type-only imports from any subpath are
> fine, because they erase.

### Reaching a model

`getModel` and `hasModel` ship from the `astromech` barrel your plugin already
imports, so reaching a model needs nothing from `ctx`:

```ts
import { generateText } from 'ai';
import { getModel } from 'astromech';

const model = getModel('my-plugin');
if (model === undefined) return; // no `ai` block — the feature is off
```

`getModel(name?)` returns the model registered under that name, falls back to
the site's default, and returns `undefined` when the site has configured no `ai`
block at all. It never throws, so branch on `undefined` and disable the feature
rather than failing the request. `hasModel(name?)` answers the same question
without handing you an instance, for a check that only decides whether to render
something.

Generation is the AI SDK's — take `ai` as a dependency of your package and pass
the model you were given to `generateText`, `streamText` or `Output.object`. The
provider package is the site's business, not yours; you only ever see the model
instance it configured. `@astromech/assistant` is the worked example:
`getModel('assistant')`, a 503 naming what to configure when it comes back
`undefined`, and a `streamText` loop over `ctx.methods.tools()`.
[configuration/ai.md](../configuration/ai.md) covers what a site puts in the
config for any of this to resolve.

### Raw HTTP routes

`defineServiceMethod` is JSON-in / JSON-out over `POST`, which covers almost
everything. When a payload can't survive that — binary bodies, `multipart`
uploads, streamed responses — declare a `rawRoutes` array instead. Each route
gets a Web-standard `Request`, the plugin context acting as the caller, and the
values of the path's `:name` segments, and returns a `Response`; the plugin
never touches Hono.

```ts
// routes/exports.ts
import type { PluginRawRoute } from 'astromech';

export const exportRoutes: PluginRawRoute[] = [
    {
        method: 'GET',
        path: '/exports/:id/download', // relative to ${basePath}/api/plugins/<serviceKey>
        access: { permission: 'download' },
        handler: async (_request, ctx, params) => {
            const obj = await ctx.storage.get(`exports/${params['id']}.gz`);
            return new Response(obj.body, {
                headers: { 'Content-Type': 'application/gzip' },
            });
        },
    },
];
```

Raw routes mount under the **service key**, alongside RPC, and their `access`
resolves the same way, so a bare permission key is namespaced identically.

A handler is a closure, like a hook or a cron handler, so a factory-form plugin
builds its routes from its resolved options: `@astromech/backups` passes its
`keep` option to `buildBackupRoutes(keep)`.

Two things to hold onto:

- **Reach for it only when RPC genuinely can't carry the payload.** An endpoint
  that returns plain JSON belongs on `defineServiceMethod`, where it is typed,
  callable off `Astromech.plugins.<serviceKey>` and `ctx.service` in an admin
  page, and listed in the method manifest that the CLI and MCP discover from.
  A raw route is invisible to all of that.
- **Scope the permission to what the response actually exposes.** The
  granularity of a raw route is whatever you write, and a streamed artifact is
  usually a much larger grant than the metadata endpoint next to it.

### Service methods

A service method is one verb your plugin offers. Each is callable over RPC as
`Astromech.plugins.<serviceKey>.<key>`, from an admin page through
`ctx.service`, and by the assistant, which discovers it from the method
manifest. Declare each one with `defineServiceMethod` and collect them in a
plain object your definition passes as `service`:

```ts
// service/describe.ts
import { defineServiceMethod, noInput } from 'astromech';
import { RATING_FIELD_TYPE } from '../fields/rating';

export type RatingDescription = { fieldType: string; usedBy: string[]; max: number };

export const ratingService = {
    describe: defineServiceMethod({
        access: 'authenticated',
        summary: 'Describe the rating field type and where it is used.',
        input: noInput(),
        mutates: false,
        handler: (_input, ctx): RatingDescription => ({
            fieldType: RATING_FIELD_TYPE,
            usedBy: ctx.config.entryTypesWithField(RATING_FIELD_TYPE),
            max: 5,
        }),
    }),
};
```

`summary` is the one line humans and the assistant read. `input` is required: a
Zod schema for the whole argument object (`noInput()` for a method that takes
none). It is parsed before your handler runs, wherever the call came from, so
the handler receives a validated value and must not re-parse it; a bad call
throws a validation error in process and answers `422` over HTTP. `output` is
the same for the result where it is worth declaring, and `mutates` says whether
the call changes stored state, with the optional `destructive` and `idempotent`
refining it.

Both input types come from that schema, so the handler's parameter needs no
annotation: it is the schema's parsed shape, with defaults applied and strings
coerced, while a caller passes the schema's own input type. Annotate the
handler's RETURN type instead, since that is what the method's callers see.

`access` says what a caller must hold, in one of four forms:

- `'public'`: the method is ungated, signed in or not.
- `'authenticated'`: any caller with a role.
- `{ permission: 'export' }`: resolved to `plugin:<namespace>:export`, so you
  write the bare key you declared with `definePermissions` and never a prefix.
- `(input) => Permission | null`: the permission this call needs, worked out
  from its arguments, or `null` for none. It sees the arguments as the caller
  sent them, before the method parses its input, so check a value's type
  before trusting it.

`ctx` is the app context every service method in Astromech runs with, plus your
plugin's own layer over it:

- **The app context.** `db` (the query handle), `user` and `role` (who is
  calling, both `null` outside a request), `clientAddress`, `config`
  ([the projection above](#runtime-identity)), the content services `entries`,
  `globals`, `media`, `users` and `notifications`
  ([reaching them](#reaching-the-content-services)), `notify`, `email` and
  `database` ([capability ports](#capability-ports)), `logger`, `env`,
  `runHook`, and `methods`
  ([calling as the caller](#calling-as-the-caller-not-as-the-plugin)).
- **The plugin layer.** `plugin` (your resolved identity), `storage` (your
  prefixed blob handle, also a [capability port](#capability-ports)), and
  `plugins` (the other plugins' services, keyed by service key).

A handler also gets `ctx.method.name`, the dotted id it was assembled under, so
an error message can name the method without repeating a string literal.

### More surfaces

Plugins can also contribute **service methods**
([above](#service-methods)), **hooks** (`defineHook`, e.g. `entry:afterUpdate`),
**entry types**, **globals**, **cron jobs**, and **i18n** locale bundles. See the
bundled `redirects` and `seo` plugins for each.

> Plugins can't register routes outside `${basePath}/api`. To integrate with the front end,
> expose data through a service method and document a small middleware recipe —
> the plugin owns the data, the app owns the route.

### Offering your own extension point

A plugin can expose a seam of its own, so a site extends it without forking.
Declare a contract, ship implementations of it, and take one as an option:

```ts
export type SpamProvider = {
    name: string;
    siteKey: string;
    verify(token: string | undefined, context: { ip?: string }): Promise<SpamVerdict>;
};

export function turnstile(options: TurnstileOptions): SpamProvider {
    /* ... */
}
```

```ts
forms({ spam: turnstile({ siteKey, secretKey }) });
```

The type is the public surface, the factories are conveniences, and a site can
pass an object it wrote itself. Prefer this to a string union the moment there
is a plausible second implementation you don't want to own.

`@astromech/forms` has two such seams. Its spam providers take the shape above.
Its **notification providers** go further: one provider owns both halves of a
notification kind — the `fields.block(...)` an editor fills in _and_ the delivery
that reads it — so adding a kind is one file plus a registry entry, and the
editor UI follows automatically.

## Putting it together

`index.ts` imports the pieces and composes the definition. For a plugin with
options, pass `definePlugin` a factory instead of a plain object:

```ts
// index.ts
import type { RedirectsOptions } from './types.js';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index.js';
import { redirectEntryType } from './entries/redirect.js';
import { slugChangeHook } from './hooks/slug-change.js';
import { redirectsService } from './service/redirects.js';
import { redirectsTable } from './tables/redirects.js';
import { REDIRECTS_PACKAGE } from './types.js';

const DEFAULT_OPTIONS: Required<RedirectsOptions> = {
    generateOnSlugChange: true,
};

export const redirects = definePlugin((options?: RedirectsOptions) => {
    const { generateOnSlugChange } = withDefaults(DEFAULT_OPTIONS, options);

    return {
        package: REDIRECTS_PACKAGE,
        version: '0.1.0',
        label: 'Redirects',
        icon: 'Signpost',
        tables: [redirectsTable],
        migrations: migrationProvider,
        entries: [redirectEntryType],
        service: redirectsService,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
```

Redirects declares no `permissions`: its only service method is public, and its
entry type's permissions are derived by core.

A factory **must be a pure data builder**: Astromech calls it once with no
options to read identity and permission declarations, and again for each site
instantiation — `plugins: [redirects({ generateOnSlugChange: false })]`.
