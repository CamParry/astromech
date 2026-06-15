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
        package: 'my-plugin',   // canonical name — survives renames
        version: '1.0.0',
        label: 'My Plugin',     // admin sidebar group + page-title prefix
        icon: 'Puzzle',         // Lucide icon name
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
    type: 'rating',                       // build error if it collides
    component: asset('fields/rating-field.tsx'),
    defaultValue: 0,
    typeGen: () => 'number',              // TS type in generated Fields interfaces
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
    permission: 'view',          // a bare key → plugin:<namespace>:view
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

### More surfaces

Plugins can also contribute **SDK methods** (`defineSdkMethod`, callable off
`Astromech.plugins.<name>`), **hooks** (`defineHook`, e.g. `entry:afterUpdate`),
**entry types**, **database tables** (Drizzle, via `astromech/db`), and
**i18n** locale bundles. See the bundled `redirects` and `seo` plugins for each.

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
