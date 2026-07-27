# Authoring a plugin

A plugin is **one package** that extends Astromech — with custom field types,
admin pages, permissions, SDK methods, hooks, entry types, or database tables.
A plugin is mostly **declarative data**: you describe what it adds, and
Astromech wires it in.

The bundled `astromech/plugins/redirects` and `astromech/plugins/seo` plugins
are good worked examples to read alongside this guide.

## The shape of a plugin

A plugin is a **factory** created with `definePlugin`. Export the factory; it's
callable with no arguments, and any options are optional.

```ts
import { definePlugin } from 'astromech';
import { plugin } from './plugin.js';

export const myPlugin = definePlugin(plugin, () => ({
    // ...surfaces...
}));

export default myPlugin;
```

Identity comes from argument one — the `plugin` object described below — and
behaviour from the factory, so a plugin states what it _is_ exactly once.

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

Keep `index.ts` thin — it composes modules, it doesn't define them. Declare the
plugin's identity once (in `plugin.ts`) and import it everywhere else. Keep
`plugin.ts` a leaf: half your package imports it, and folding it into `index.ts`
makes the package cyclic.

```
my-plugin/
  plugin.ts              identity + asset path helpers
  index.ts               definePlugin() composing the surfaces below
  schema/widgets.ts      one file per database table (definePluginTable)
  migrations/            generated — never hand-edited
  fields/                custom field-type registrations + renderers
  pages/                 admin page registrations + renderers
  permissions.ts         permission bundles + declarations
  locales/               i18n bundles (en.json, ...)
  README.md
```

Only include what you use.

## Identity & asset paths

`plugin.ts` declares the identity as one object and a helper for asset paths.
Component and locale paths are **import-specifier strings** — Astromech loads
them lazily — so resolve them to real paths with `fileURLToPath`:

```ts
// plugin.ts
import { fileURLToPath } from 'node:url';
import type { PluginIdentity } from 'astromech';

export const plugin = {
    package: 'my-plugin', // canonical name — survives renames
    version: '1.0.0',
    label: 'My Plugin', // admin sidebar group + page-title prefix
    icon: 'Puzzle', // Lucide icon name
} as const satisfies PluginIdentity;

/** Absolute path to a bundled asset, relative to this plugin's root. */
export function asset(path: string): string {
    return fileURLToPath(new URL(path, import.meta.url));
}
```

`as const` matters: it gives `package` a literal type, which is what lets
`definePluginTable` derive a literal table name.

### The namespace

`package` is the **only** identifier you declare. Everything else — table
prefix, permission namespace, i18n namespace, HTTP route segment, SDK key —
derives from it mechanically. There is no `name`, no `alias`, and no
site-level override: a plugin's table names are baked into its shipped
migration SQL, so nothing an override could move actually moves.

The derivation, in order: `@astromech/*` packages strip their scope; everything
else drops the leading `@` and keeps its scope; then lowercase, and `/` and `-`
become `_`.

| package                   | namespace                | SDK key               |
| ------------------------- | ------------------------ | --------------------- |
| `@astromech/redirects`    | `redirects`              | `redirects`           |
| `@acme/seo`               | `acme_seo`               | `acmeSeo`             |
| `acme-seo` (unscoped)     | `acme_seo`               | `acmeSeo`             |
| `@acme-digital/seo-tools` | `acme_digital_seo_tools` | `acmeDigitalSeoTools` |

The two forms split cleanly by audience:

- **namespace** — everything that lives in your database or your permission
  strings: `plugin_acme_seo_settings`, `plugin:acme_seo:view`, the i18n bundle
  key, and the admin URL `/admin/plugin/acme_seo/*`.
- **SDK key** — everything an API caller says: `Astromech.plugins.acmeSeo` and
  the matching route, `POST /api/plugins/acmeSeo/*`. Both transports use it, so
  the property you write is the segment that goes on the wire.

Derivation runs one way only — `package` → namespace → SDK key. Nothing inverts
it, and neither should your code: if you have one form and need another, read
both off the identity rather than transforming the string. Both steps are lossy,
so a reverse transform is a guess.

Which is why a collision on either form is a hard install error. npm already
guarantees package names are unique, so you can only hit it via one of the lossy
steps: `@acme/seo` vs unscoped `acme-seo` (same namespace), or `@acme/2fa` vs
`acme2fa` (same SDK key). There is no way to resolve it site-side; one of the
packages has to be renamed by its author.

**Identifier length.** Emitted index and constraint names are capped at 63 bytes
(Postgres' limit) with a deterministic hash suffix. Table names are never
truncated — an over-long one is a generate-time error — so budget
`plugin_` + namespace + `_` + table ≤ 63 characters.

## Surfaces

### Custom field types

Register the type as data; the renderer is a separate component file.

```ts
// fields/rating.ts
import type { PluginFieldTypeRegistration } from 'astromech';
import { asset } from '../plugin.js';

export const ratingField: PluginFieldTypeRegistration = {
    type: 'rating', // build error if it collides
    component: asset('fields/rating-field.tsx'),
    defaultValue: 0,
    typeGen: () => 'number', // TS type in generated Fields interfaces
};
```

The renderer **default-exports** a component taking `BaseFieldProps`, and may
also export `validate(value, field)`:

```tsx
// fields/rating-field.tsx
import type { BaseFieldProps } from 'astromech';

export default function RatingField({ name, value, onChange, disabled }: BaseFieldProps) {
    /* ... */
}
```

Then reference it anywhere a field is declared: `{ name: 'quality', type: 'rating' }`.

### Admin pages

Pages mount under `/admin/plugin/<name>/<path>` and appear in the sidebar. A
page is **either** a `component` view **or** an auto-rendered `settings` form.

```ts
// pages/overview.ts
import { defineAdminPage } from 'astromech';
import { asset } from '../plugin.js';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'ChartBar',
    component: asset('pages/overview-page.tsx'),
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
    settings: {
        fields: [fields.boolean('showInListing', { label: 'Show ratings in lists' })],
    },
});
```

Page components call `useAstromechPlugin()` (from `astromech/ui`) for context —
`plugin`, `currentUser`, `toast`, and the `t()` translator.

### Permissions

Declare permissions for the admin UI, and expose **bundles** for composing into
roles. Bundle keys resolve to `plugin:<namespace>:<key>`.

```ts
// permissions.ts
import { definePermissionBundles } from 'astromech';
import type { PluginPermission } from 'astromech';
import { plugin } from './plugin.js';

export const myPermissions = definePermissionBundles(plugin.package, {
    view: ['view'],
});

export const myPermissionDefs: PluginPermission[] = [
    { key: 'view', label: 'View reports', description: 'See the dashboard.' },
];
```

```ts
// in a consumer's config
roles: {
    editor: { name: 'Editor', permissions: [...builtInRole('editor'), ...myPermissions('view')] },
}
```

### Database tables

A plugin that needs its own storage declares each table with
`definePluginTable` from `astromech/plugin-kit`, one file per table. It is
`defineTable` scoped to your plugin: you pass your identity object and a bare
name, and it prefixes both the table and any index names with
`plugin_<namespace>_` so two plugins can never collide.

```ts
// schema/widgets.ts
import { definePluginTable, type TableSelect } from 'astromech/plugin-kit';
import { plugin } from '../plugin.js';

export const widgetsTable = definePluginTable(
    plugin,
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

export const myPlugin = definePlugin(plugin, () => ({
    // ...
    schema: [widgetsTable],
    migrations: migrationProvider,
}));
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
`encodePatchWith(widgetsTable, patch)` — all from `astromech/plugin-kit`.

### More surfaces

Plugins can also contribute **SDK methods** (`defineSdkMethod`, callable off
`Astromech.plugins.<sdkKey>`), **hooks** (`defineHook`, e.g. `entry:afterUpdate`),
**entry types**, and **i18n** locale bundles. See the bundled `redirects` and
`seo` plugins for each.

> Plugins can't register routes outside `/api`. To integrate with the front end,
> expose data through an SDK method and document a small middleware recipe — the
> plugin owns the data, the app owns the route.

## Putting it together

`index.ts` imports the pieces and composes the definition:

```ts
import { definePlugin } from 'astromech';
import { plugin } from './plugin.js';
import { myPermissionDefs } from './permissions.js';
import { ratingField } from './fields/rating.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';

export { myPermissions } from './permissions.js';

export const myPlugin = definePlugin(plugin, () => ({
    permissions: myPermissionDefs,
    fields: [ratingField],
    admin: { pages: [overviewPage, settingsPage] },
}));

export default myPlugin;
```
