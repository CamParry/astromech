# @astromech/redirects

Manage URL redirects, look them up from anywhere via the SDK, and (optionally)
auto-create a redirect whenever an entry's slug changes.

Redirects are stored in the plugin's **own table** (`plugin_redirects_redirects`)
via `tableStorage`, not in the shared `entries` table. They are still managed
through the standard entry admin UI as a titleless entry type.

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { redirects } from 'astromech/plugins/redirects';

export default defineConfig({
    plugins: [redirects()],
    // ...
});
```

After adding the plugin, generate and apply the migration for its table:

```sh
astromech db:generate   # emits a migration covering plugin_redirects_redirects
astromech db:migrate
```

### Options

```ts
redirects({
    // Auto-create a redirect when an entry's slug changes. Default: true.
    generateOnSlugChange: true,
    // Map an entry to the public path it is served at. Default: `/${slug}`.
    pathForEntry: ({ type, slug }) => (slug ? `/${type}/${slug}` : null),
});
```

This adds a **Redirects** entry type to the admin (managed like any other) with
`from`, `to`, `status` (301/302), and `enabled` fields. The list lives at
`/admin/plugin/redirects/entries/redirect`.

## Permissions

The plugin exposes `redirectsPermissions` bundles for composing into roles:

- `manage` — read/create/update/delete redirects
- `view` — read only

These resolve to `plugin:astromech-redirects:entry:redirect:{action}`.

```ts
// astromech.config.ts
import { builtInRole } from 'astromech';
import { redirects, redirectsPermissions } from 'astromech/plugins/redirects';

export default defineConfig({
    plugins: [redirects()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [...builtInRole('editor'), ...redirectsPermissions('manage')],
        },
    },
});
```

## Looking up a redirect

The `lookup` method is `public` and works identically over the local DB
(`astromech/local`) and HTTP (`astromech/fetch`):

```ts
import { Astromech } from 'astromech/local';

const match = await Astromech.plugins.redirects.lookup({ from: '/old-path' });
// → { to: '/new-path', status: '301' } | null
```

Managing redirects directly via the SDK uses the plugin entries surface:

```ts
await Astromech.plugins.redirects.entries.create({
    type: 'redirect',
    fields: { from: '/old', to: '/new', status: '301', enabled: true },
});
```

## Frontend integration (recipe)

The plugin exposes **data**; your app owns the route. Plugins cannot register
routes outside `/api`, so add a tiny middleware in your framework. For Astro:

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { Astromech } from 'astromech/local';

export const onRequest = defineMiddleware(async (context, next) => {
    const match = await Astromech.plugins.redirects.lookup({
        from: context.url.pathname,
    });
    if (match) {
        return context.redirect(match.to, Number(match.status));
    }
    return next();
});
```

(Combine with other middleware via Astro's `sequence()` as needed.)
