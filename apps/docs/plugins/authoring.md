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
  schema/widgets.ts      one file per database table (definePluginTable)
  migrations/            generated — never hand-edited
  fields/                custom field-type registrations
  pages/                 admin page registrations
  permissions/           permission bundles + declarations
  admin/
    fields/              field renderers (.tsx)
    pages/               page renderers (.tsx)
    slots/               slot renderers (.tsx)
  locales/               i18n bundles (en.json, ...)
  README.md
```

Only include what you use.

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
  strings: `plugin_acme_seo_settings`, `plugin:acme_seo:view`, the i18n bundle
  key, and the admin URL `/admin/plugin/acme_seo/*`.
- **service key** — everything an API caller says: `Astromech.plugins.acmeSeo`
  and the matching route, `POST /api/plugins/acmeSeo/*`. Both transports use it,
  so the property you write is the segment that goes on the wire.

Derivation runs one way only — `package` → namespace → service key. Nothing
inverts it, and neither should your code: if you have one form and need
another, read both off the identity rather than transforming the string. Both
steps are lossy, so a reverse transform is a guess. At runtime, read it off
`ctx.plugin` (`package`, `namespace`, `serviceKey`, `permissionNamespace`)
rather than deriving it yourself — see [Runtime identity](#runtime-identity)
below.

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
import type { PluginFieldTypeRegistration } from 'astromech';

export const ratingField: PluginFieldTypeRegistration = {
    type: 'rating',
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0,
    typeGen: () => 'number',
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

Register the type as data; the renderer is a separate component file.

```ts
// fields/rating.ts
import type { PluginFieldTypeRegistration } from 'astromech';
import { RATING_FIELD_TYPE } from '../types.js';

export const ratingField: PluginFieldTypeRegistration = {
    type: RATING_FIELD_TYPE, // build error if it collides
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0,
    typeGen: () => 'number', // TS type in generated Fields interfaces
};
```

The renderer **default-exports** a component taking `BaseFieldProps`, and may
also export `validate(value, field)`:

```tsx
// admin/fields/rating-field.tsx
import type { BaseFieldProps, FieldDefinition } from 'astromech';

export default function RatingField({ name, value, onChange, disabled }: BaseFieldProps) {
    /* ... */
}

export function validate(value: unknown, field: FieldDefinition): string | undefined {
    /* ... */
}
```

A presentational field that persists no data (a preview, say) returns `null`
from `typeGen` so it's omitted from generated entry `Fields` types entirely.

Then reference it anywhere a field is declared: `{ name: 'quality', type: 'rating' }`.

### Admin pages

A page appears in the sidebar (unless it sets `nav: false`) and is **either** a
`component` view **or** an auto-rendered `fields` settings form — exactly one,
validated crash-loud at config resolution.

```ts
// pages/overview.ts
import { defineAdminPage } from 'astromech';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'ChartBar',
    component: './admin/pages/overview-page.tsx',
    permission: 'view', // a bare key → plugin:<namespace>:view
});
```

```ts
// pages/settings.ts — auto-rendered form (no component)
import { defineAdminPage } from 'astromech';
import * as fields from 'astromech/fields';

export const settingsPage = defineAdminPage({
    path: '/settings',
    label: 'Settings',
    icon: 'Settings',
    fields: [fields.boolean('showInListing', { label: 'Show ratings in lists' })],
});
```

#### Where a page ends up

`defineAdminPage` is one helper for both origins — a host app's `admin.pages`
and a plugin's `admin.pages` take the same object. **The registration site
decides the scoping, not the name of the helper**, so what you declare is a
**bare `path`** and Astromech absolutizes it wherever it was registered:

| declared in     | route                             | settings `baseKey`          | default permission                                 |
| --------------- | --------------------------------- | --------------------------- | -------------------------------------------------- |
| a plugin        | `/admin/plugin/<namespace><path>` | `plugin:<namespace>:<path>` | `settings:read` for `fields`, none for `component` |
| the host config | `/admin/page/<path>`              | `<path>`                    | `settings:read`                                    |

The `baseKey` is the settings key a `fields` page reads and writes: a
non-translatable page stores one blob at `baseKey`, a translatable one stores
the shared fields at `baseKey` and per-locale fields at `baseKey:<locale>`.

Plugin paths lead with a `/` (`'/overview'` → `/admin/plugin/seo/overview`);
`path: ''` is legal and mounts the page at the plugin's root,
`/admin/plugin/backups`. Host paths don't (`path: 'globals'` →
`/admin/page/globals`), because the host route already supplies the separator.

**Do not namespace the path yourself.** A declaration is relative by design and
there is no double-prefix guard — writing `path: '/myplugin/overview'` inside
`@acme/myplugin` gets you `/admin/plugin/myplugin/myplugin/overview` and a
`baseKey` of `plugin:myplugin:/myplugin/overview`. The same rule holds for
`permission`, which takes a bare key (`'view'` → `plugin:<namespace>:view`).

Page components call `useAstromechPlugin()` (from `astromech/ui`) for context:

```tsx
// admin/pages/overview-page.tsx
import { useAstromechPlugin } from 'astromech/ui';

export default function OverviewPage() {
    const { plugin, currentUser, toast, t } = useAstromechPlugin();
    // ...
}
```

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

### Permissions

Declare permissions for the admin UI, and expose **bundles** for composing
into roles. Both live on the definition, and they answer different questions:
`permissions` is the flat list that powers the admin permission UI;
`permissionBundles` is what a site actually composes into a role. Bundle keys
resolve to `plugin:<namespace>:<key>`.

```ts
// permissions/rating.ts
import type { PluginPermission } from 'astromech';

export const ratingPermissionBundles = {
    view: ['view'],
} as const;

export const ratingPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
];
```

A site reads a bundle straight off the plugin factory, namespaced already:

```ts
// in a consumer's config
roles: {
    editor: { name: 'Editor', permissions: [...builtInRole('editor'), ...myPlugin.permissions('view')] },
}
```

Bundle names are literal-typed, so `myPlugin.permissions('view')` type-checks
and `myPlugin.permissions('viwe')` does not.

### Database tables

A plugin that needs its own storage declares each table with
`definePluginTable` from `astromech`, one file per table. It is
`defineTable` scoped to your plugin: you pass your package name and a bare
name, and it prefixes both the table and any index names with
`plugin_<namespace>_` so two plugins can never collide.

```ts
// schema/widgets.ts
import { definePluginTable, type TableSelect } from 'astromech';
import { MY_PLUGIN_PACKAGE } from '../types.js';

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
// widgetsTable.name === 'plugin_my_plugin_widgets'

export type WidgetRow = TableSelect<typeof widgetsTable>;
```

`definePluginTable`'s first argument takes the package name as a **value** —
not read off the plugin's definition — because the prefix has to exist as a
_literal type_ for `PluginDB` to key on, and a value declared inside
`definePlugin` can't reach a module-scope descriptor. So a plugin with tables
keeps its package name in a dependency-free leaf both `index.ts` and its
schema modules can import:

```ts
// types.ts
export const MY_PLUGIN_PACKAGE = '@acme/my-plugin';
```

```ts
// index.ts
export const myPlugin = definePlugin({
    package: MY_PLUGIN_PACKAGE,
    schema: [widgetsTable],
    migrations: migrationProvider,
    // ...
});
```

This is the one place a plugin names its identity outside `index.ts` — every
other sub-module either declares a relative fact or reads `ctx.plugin` at
runtime.

`id` columns are ULIDs and timestamps are ISO-8601 TEXT, both filled from the
descriptor — you never mint them yourself.

Your plugin owns its migrations. Generate them into the package, commit them,
and list the provider on the definition:

```sh
npx astromech plugin:generate --name baseline   # → migrations/0000_baseline.ts
```

```ts
import { migrationProvider } from '../migrations/index.js';
import { widgetsTable } from './schema/widgets.js';

export const myPlugin = definePlugin({
    package: MY_PLUGIN_PACKAGE,
    // ...
    schema: [widgetsTable],
    migrations: migrationProvider,
});
```

Migrations are generated, never hand-written: if the output is wrong, fix the
descriptor and regenerate. The app merges every installed plugin's chain into
its own at apply time (under `plugin_<namespace>_`-prefixed names, in one shared
`kysely_migration` table), so `db:init` is all a consumer runs.

Installed plugins are tracked in `_astromech_plugins`. Removing a plugin from
`astromech.config.ts` leaves its tables behind on purpose — the app warns about
the orphan, and `npx astromech plugin:purge <package>` drops its tables,
migration rows and tracking row once you are sure. Purge takes the package name
(`@acme/seo`), not the namespace — at a destructive call site the canonical
identifier is the unambiguous one.

For reads and writes that bypass a storage layer, decode and encode rows with
the descriptor: `decodeWith(widgetsTable, row)`, `encodeWith(widgetsTable, values)`,
`encodePatchWith(widgetsTable, patch)` — all from `astromech`.

### Runtime identity

Hooks, service methods, cron handlers and `setup()` all receive a
`PluginContext`, which carries the plugin's own resolved identity at
`ctx.plugin` — `package`, `namespace`, `serviceKey`, `permissionNamespace`, and
`version` if declared. Runtime code that needs a namespaced string reads it
from there instead of importing an identity module:

```ts
// backup.ts
export async function resolveKeep(ctx: PluginContext, fallback: number): Promise<number> {
    const key = `plugin:${ctx.plugin.namespace}:retention`;
    const value = await ctx.settings.get(key);
    // ...
}
```

```ts
// menus/service/menus.ts
const blobKey = `plugin:${ctx.plugin.namespace}:/menus/${key}`;
```

### Reaching the content services

The domains sit directly on the context — `ctx.entries`, `ctx.media`,
`ctx.settings`, `ctx.users`, `ctx.notifications`, `ctx.plugins` — and each is
the **global** service, not a per-plugin view. Reads default to the `full`
shape, because plugin altitude is trusted server code; pass an explicit
`full: false` if you want the public shape.

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

### More surfaces

Plugins can also contribute **service methods** (`defineServiceMethod`,
callable off `Astromech.plugins.<serviceKey>`), **hooks** (`defineHook`, e.g.
`entry:afterUpdate`), **entry types**, and **i18n** locale bundles. See the
bundled `redirects` and `seo` plugins for each.

> Plugins can't register routes outside `/api`. To integrate with the front end,
> expose data through a service method and document a small middleware recipe —
> the plugin owns the data, the app owns the route.

## Putting it together

`index.ts` imports the pieces and composes the definition. For a plugin with
options, pass `definePlugin` a factory instead of a plain object:

```ts
// index.ts
import { definePlugin, withDefaults } from 'astromech';
import type { RedirectsOptions } from './types.js';
import { REDIRECTS_PACKAGE } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { redirectEntryType } from './entries/redirect.js';
import { redirectsPermissionBundles } from './permissions/redirects.js';
import { redirectsTable } from './schema/redirects.js';
import { redirectsService } from './service/redirects.js';
import { slugChangeHook } from './hooks/slug-change.js';

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
        permissionBundles: redirectsPermissionBundles,
        schema: [redirectsTable],
        migrations: migrationProvider,
        entries: [redirectEntryType],
        service: redirectsService,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
```

A factory **must be a pure data builder**: Astromech calls it once with no
options to read identity and permission bundles, and again for each site
instantiation — `plugins: [redirects({ generateOnSlugChange: false })]`.
