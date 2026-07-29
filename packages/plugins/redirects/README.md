# @astromech/redirects

Manage URL redirects, look them up from anywhere via Astromech, and (optionally)
auto-create a redirect whenever an entry's front-end URL changes.

Redirects are stored in the plugin's **own table** (`plugin_redirects_redirects`)
via `tableStorage`, not in the shared `entries` table. They are still managed
through the standard entry admin UI as a titleless entry type.

## Layout

```
redirects/
  src/index.ts                definePlugin() — identity + composing the surfaces below
  src/types.ts                RedirectsOptions + REDIRECTS_PACKAGE
  src/schema/redirects.ts     definePluginTable — the `redirects` table descriptor
  src/schema/index.ts         the ./schema subpath entry (descriptors only)
  migrations/                 generated — never hand-edited
  src/entries/redirect.ts     defineEntryType — the table-backed entry type
  src/service/redirects.ts    the public `lookup` method
  src/hooks/slug-change.ts    defineHook — auto-create a redirect on URL change
  src/permissions/redirects.ts  permission bundles + declarations
```

## Identity

`package: '@astromech/redirects'` is the only identifier declared. The
`@astromech/` scope is stripped when deriving, and `redirects` is a single
word, so both derived forms come out identical:

| form        | value       | where it appears                                          |
| ----------- | ----------- | --------------------------------------------------------- |
| namespace   | `redirects` | permissions, entry type ids, admin URLs, table prefix     |
| service key | `redirects` | `Astromech.plugins.redirects`, `/api/plugins/redirects/…` |

The table is `plugin_redirects_redirects` — `definePluginTable` owns that
prefix, so the descriptor declares the bare name `redirects`.

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { redirects } from '@astromech/redirects';

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

The plugin declares permission bundles for composing into roles, read straight
off the plugin:

- `manage` — read/create/update/delete redirects
- `view` — read only

These resolve to `plugin:redirects:entry:redirect:{action}`.

```ts
// astromech.config.ts
import { builtInRole } from 'astromech';
import { redirects } from '@astromech/redirects';

export default defineConfig({
    plugins: [redirects()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [...builtInRole('editor'), ...redirects.permissions('manage')],
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

Redirects are ordinary entries, so manage them through the one entries service.
A plugin entry type is addressed by its qualified id, `<namespace>/<type>`:

```ts
await Astromech.entries.create({
    type: 'redirects/redirect',
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
