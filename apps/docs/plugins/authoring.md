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
import type { PluginDefinition } from 'astromech';

export const myPlugin = definePlugin(() => {
    const definition: PluginDefinition = {
        package: 'my-plugin', // canonical name — survives renames
        version: '1.0.0',
        label: 'My Plugin', // admin sidebar group + page-title prefix
        icon: 'Puzzle', // Lucide icon name
        // ...surfaces...
    };
    return definition;
});

export default myPlugin;
```

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
plugin's identity once (in `manifest.ts`) and import it everywhere else.

```
my-plugin/
  manifest.ts            identity + asset path helpers
  index.ts               definePlugin() composing the surfaces below
  schema/index.ts        database tables (definePlugin)
  migrations/            generated — never hand-edited
  fields/                custom field-type registrations + renderers
  pages/                 admin page registrations + renderers
  permissions.ts         permission bundles + declarations
  locales/               i18n bundles (en.json, ...)
  README.md
```

Only include what you use.

## Identity & asset paths

`manifest.ts` declares the four identity fields and a helper for asset paths.
Component and locale paths are **import-specifier strings** — Astromech loads
them lazily — so resolve them to real paths with `fileURLToPath`:

```ts
// manifest.ts
import { fileURLToPath } from 'node:url';

export const PACKAGE = 'my-plugin';
export const VERSION = '1.0.0';
export const LABEL = 'My Plugin';
export const ICON = 'Puzzle';

/** Absolute path to a bundled asset, relative to this plugin's root. */
export function asset(path: string): string {
    return fileURLToPath(new URL(path, import.meta.url));
}
```

Identity-derived strings follow fixed conventions: the **permission namespace**
is the package lowercased with `@` removed and `/` → `-` (so `@me/seo` →
`me-seo`), and any database tables must be prefixed `plugin_<name>_`.

## Surfaces

### Custom field types

Register the type as data; the renderer is a separate component file.

```ts
// fields/rating.ts
import type { PluginFieldTypeRegistration } from 'astromech';
import { asset } from '../manifest.js';

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
import { asset } from '../manifest.js';

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
import { PACKAGE } from './manifest.js';

export const myPermissions = definePermissionBundles(PACKAGE, {
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

A plugin that needs its own storage declares tables with `definePlugin` from
`astromech/plugin-kit`. It is `defineTable` scoped to your alias: you pass bare
names, and it prefixes both the table and any index names with
`plugin_<alias>_` so two plugins can never collide.

```ts
// schema/index.ts
import { definePlugin, type TableSelect } from 'astromech/plugin-kit';

export const tables = definePlugin({
    alias: 'my-plugin',
    schema: ({ table }) => ({
        widgets: table(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                label: col.text({ notNull: true }),
                status: col.enum(['draft', 'live'], { notNull: true }),
                createdAt: col.timestamp({ notNull: true, defaultNow: true }),
            }),
            ({ index }) => [index('idx_status', ['status'])]
        ),
    }),
});

export const widgetsTable = tables.widgets;
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
import { widgetsTable } from './schema/index.js';

const definition: PluginDefinition = {
    // ...
    schema: [widgetsTable],
    migrations: migrationProvider,
};
```

Migrations are generated, never hand-written: if the output is wrong, fix the
descriptor and regenerate. The app merges every installed plugin's chain into
its own at apply time (under `plugin_<alias>_`-prefixed names, in one shared
`kysely_migration` table), so `db:init` is all a consumer runs.

Installed plugins are tracked in `_astromech_plugins`. Removing a plugin from
`astromech.config.ts` leaves its tables behind on purpose — the app warns about
the orphan, and `npx astromech plugin:purge <alias>` drops its tables, migration
rows and tracking row once you are sure.

For reads and writes that bypass a storage layer, decode and encode rows with
the descriptor: `decodeWith(widgetsTable, row)`, `encodeWith(widgetsTable, values)`,
`encodePatchWith(widgetsTable, patch)` — all from `astromech/plugin-kit`.

### More surfaces

Plugins can also contribute **SDK methods** (`defineSdkMethod`, callable off
`Astromech.plugins.<name>`), **hooks** (`defineHook`, e.g. `entry:afterUpdate`),
**entry types**, and **i18n** locale bundles. See the bundled `redirects` and
`seo` plugins for each.

> Plugins can't register routes outside `/api`. To integrate with the front end,
> expose data through an SDK method and document a small middleware recipe — the
> plugin owns the data, the app owns the route.

## Putting it together

`index.ts` imports the pieces and composes the definition:

```ts
import { definePlugin } from 'astromech';
import type { PluginDefinition } from 'astromech';
import { PACKAGE, VERSION, LABEL, ICON } from './manifest.js';
import { myPermissionDefs } from './permissions.js';
import { ratingField } from './fields/rating.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';

export { myPermissions } from './permissions.js';

export const myPlugin = definePlugin(() => {
    const definition: PluginDefinition = {
        package: PACKAGE,
        version: VERSION,
        label: LABEL,
        icon: ICON,
        permissions: myPermissionDefs,
        fields: [ratingField],
        admin: { pages: [overviewPage, settingsPage] },
    };
    return definition;
});

export default myPlugin;
```
