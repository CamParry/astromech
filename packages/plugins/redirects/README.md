# @astromech/redirects

Manage URL redirects, look them up from anywhere via Astromech, and (optionally)
auto-create a redirect whenever an entry's front-end URL changes.

Redirects are stored in the plugin's **own table** (`plugin_redirects_redirects`)
via `tableRepository`, not in the shared `entries` table. They are still managed
through the standard entry admin UI as a titleless entry type.

## Layout

```
redirects/
  src/index.ts                definePlugin() — identity + composing the surfaces below
  src/types.ts                RedirectsOptions + REDIRECTS_PACKAGE
  src/tables/redirects.ts     definePluginTable — the `redirects` table
  src/tables/index.ts         the ./tables subpath entry (tables only)
  migrations/                 generated — never hand-edited
  src/entries/redirect.ts     defineEntryType — the custom-table entry type
  src/service/redirects.ts    the public `lookup` method
  src/hooks/slug-change.ts    defineHook — auto-create a redirect on URL change
```

There is no `permissions/` directory: this plugin declares no permissions of
its own (see below).

## Identity

`package: '@astromech/redirects'` is the only identifier declared. The
`@astromech/` scope is stripped when deriving, and `redirects` is a single
word, so both derived forms come out identical:

| form        | value       | where it appears                                          |
| ----------- | ----------- | --------------------------------------------------------- |
| namespace   | `redirects` | permissions, entry type ids, admin URLs, table prefix     |
| service key | `redirects` | `Astromech.plugins.redirects`, `/api/plugins/redirects/…` |

The table is `plugin_redirects_redirects` — `definePluginTable` owns that
prefix, so the table declares the bare name `redirects`.

## Install

```ts
// astromech.config.ts
import { redirects } from '@astromech/redirects';
import { defineConfig } from 'astromech';

export default defineConfig({
    plugins: [redirects()],
    // ...
});
```

After adding the plugin, apply its migrations:

```sh
astromech db:init
```

The table's migration ships pre-generated inside the package
(`migrations/0000_baseline.ts`); `db:init` merges it into the app's chain and
applies it — there's nothing to generate.

## Options

```ts
redirects({
    // Auto-create a redirect when an entry's resolved URL changes. Default: true.
    generateOnSlugChange: true,
});
```

When `generateOnSlugChange` is on, the plugin derives the old and new paths from
the updated entry type's `url` template (e.g. `url: '/blog/{slug}'`) — the same
template that powers the admin **View** link. Entry types without a `url`
template are skipped, so the plugin never guesses a path.

This adds a **Redirects** entry type to the admin (managed like any other) with
`from`, `to`, `status` (301/302), and `enabled` fields. The list lives at
`/admin/plugin/redirects/entries/redirect`.

## Permissions

The plugin declares **no** permissions of its own: `lookup` is public, and a
redirect is an ordinary entry, so its permissions are the entry permissions core
derives from the registered type — `plugin:redirects:entry:redirect:{action}`
for `read`, `create`, `update` and `delete`.

A site grants them by naming the qualified type id and the actions it wants.
There are no bundles; enumeration is the point of an opt-in model.

```ts
// astromech.config.ts
import { redirects } from '@astromech/redirects';
import { defineConfig, entryPermissions, permissionsForBuiltInRole } from 'astromech';

export default defineConfig({
    plugins: [redirects()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...permissionsForBuiltInRole('editor'),
                ...entryPermissions(
                    'redirects/redirect',
                    'read',
                    'create',
                    'update',
                    'delete'
                ),
            ],
        },
    },
});
```

Note that `permissionsForBuiltInRole('editor')`'s `entry:*` does **not** reach these — the
plugin form is deliberately a separate namespace, so a plugin's entry types are
never granted by a root-level wildcard. Run `astromech permissions` to list
every grantable string your config produces.

## Looking up a redirect

The `lookup` method is `public` and works identically in process (the
application instance) and over HTTP (`astromech/fetch`):

```ts
import { getAstromech } from 'astromech';

const app = await getAstromech();
const match = await app.plugins.redirects.lookup({ from: '/old-path' });
// → { to: '/new-path', status: '301' } | null
```

Redirects are ordinary entries, so manage them through the one entries service.
A plugin entry type is addressed by its qualified id, `<namespace>/<type>`:

```ts
await app.entries.create({
    type: 'redirects/redirect',
    data: { fields: { from: '/old', to: '/new', status: '301', enabled: true } },
});
```

## Frontend integration (recipe)

The plugin exposes **data**; your app owns the route. Plugins cannot register
routes outside `/api`, so add a tiny middleware in your framework. For Astro:

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { getAstromech } from 'astromech';

export const onRequest = defineMiddleware(async (context, next) => {
    const app = await getAstromech();
    const match = await app.plugins.redirects.lookup({
        from: context.url.pathname,
    });
    if (match) {
        return context.redirect(match.to, Number(match.status));
    }
    return next();
});
```

(Combine with other middleware via Astro's `sequence()` as needed.)
