# @astromech/redirects

Manage URL redirects in the admin, look them up from a site's middleware, and
(optionally) record a redirect whenever an entry's front-end URL changes.

Redirect rules live in the plugin's own table (`plugin_redirects_redirects`),
one rule per `from` path. The plugin reads and writes them through its own
repository and service methods, and the admin screens come from an admin
resource over those methods.

## Layout

```
redirects/
  src/index.ts                  definePlugin(): identity, composing the surfaces below
  src/types.ts                  RedirectsOptions, RedirectMatch, REDIRECTS_PACKAGE
  src/tables/redirects.ts       definePluginTable: the `redirects` table, unique on `from`
  src/tables/index.ts           the ./tables subpath entry (tables only)
  migrations/                   generated, never hand-edited
  src/repository.ts             createRedirectsRepository: the only database access
  src/fields.ts                 the rule's field definitions, for the form and for validation
  src/permissions/redirects.ts  definePermissions: read, create, update, delete
  src/service/redirects.ts      lookup (public), list, get, create, update, delete
  src/resources/redirects.ts    defineAdminResource: the admin's list and edit screens
  src/hooks/slug-change.ts      defineHook: record a redirect on URL change
```

## Identity

`package: '@astromech/redirects'` is the only identifier declared. The
`@astromech/` scope is stripped when deriving, and `redirects` is a single
word, so both derived forms come out identical:

| form        | value       | where it appears                                          |
| ----------- | ----------- | --------------------------------------------------------- |
| namespace   | `redirects` | permissions, admin URLs, table prefix                     |
| service key | `redirects` | `Astromech.plugins.redirects`, `/api/plugins/redirects/…` |

The table is `plugin_redirects_redirects`: `definePluginTable` owns that
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

The migrations ship pre-generated inside the package (`migrations/`), and
`db:init` merges them into the app's chain and applies them. There is nothing to
generate.

## The table

| column      | type    | notes                                         |
| ----------- | ------- | --------------------------------------------- |
| `id`        | text    | ULID                                          |
| `from`      | text    | the request path; unique                      |
| `to`        | text    | the path or URL to send the visitor to        |
| `status`    | text    | `'301'` (default) or `'302'`                  |
| `enabled`   | boolean | default true; a disabled rule is not followed |
| `createdAt` | text    | ISO timestamp                                 |
| `updatedAt` | text    | ISO timestamp                                 |

A path matches exactly: no trailing-slash, query-string or case folding.

## Permissions

| key      | grants                                          |
| -------- | ----------------------------------------------- |
| `read`   | The admin list and edit screens (`list`, `get`) |
| `create` | Adding a rule (`create`)                        |
| `update` | Editing a rule (`update`)                       |
| `delete` | Removing a rule (`delete`)                      |

Core namespaces each key to `plugin:redirects:{key}`. A site grants them by
naming the keys it wants:

```ts
// astromech.config.ts
import { redirects } from '@astromech/redirects';
import { defineConfig, permissionsForBuiltInRole } from 'astromech';

export default defineConfig({
    plugins: [redirects()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...permissionsForBuiltInRole('editor'),
                ...redirects.permissions('read', 'create', 'update', 'delete'),
            ],
        },
    },
});
```

`lookup` needs no permission. Run `astromech permissions` to list every
grantable string your config produces.

## Service methods

Every method works the same in process (the application instance) and over HTTP
(`POST /api/plugins/redirects/<method>`, or `astromech/fetch`).

| method   | access   | input                             | answers                                     |
| -------- | -------- | --------------------------------- | ------------------------------------------- |
| `lookup` | public   | `{ from }`                        | `{ to, status }`, or `null`                 |
| `list`   | `read`   | `{ search?, sort?, page, limit }` | `{ data, pagination }`                      |
| `get`    | `read`   | `{ id }`                          | the rule, or `null`                         |
| `create` | `create` | `{ data }`                        | the new rule                                |
| `update` | `update` | `{ id, data }`                    | the saved rule, or `null` for an unknown id |
| `delete` | `delete` | `{ id }`                          | `{ deleted }`                               |

`list` searches `from` and `to`, and sorts by `from` unless `sort` names
another column. `create` and `update` check `data` against the rule's fields
(`src/fields.ts`): `from` and `to` are required, `status` is `301` or `302`, and
`from` must not belong to another rule. A failure answers a 422 with the
messages by field, which the admin form shows under each field. An `update`
keeps any field its `data` leaves out.

```ts
import { getAstromech } from 'astromech';

const app = await getAstromech();

await app.plugins.redirects.create({ data: { from: '/old', to: '/new' } });

const match = await app.plugins.redirects.lookup({ from: '/old' });
// → { to: '/new', status: '301' } | null
```

`lookup` reads one row through the unique index on `from`, and answers `null`
for a disabled rule.

## The admin screens

The plugin declares one admin resource, **Redirects**, in the sidebar. Its list
lives at `/cms/plugin/redirects/resources/redirects`, with search, a sortable
`from` column and a create button. A row opens an edit form over the same
fields. Each screen and action appears only to a user holding the permission of
the method behind it.

## Options

```ts
redirects({
    // Record a redirect when an entry's resolved URL changes. Default: true.
    generateOnSlugChange: true,
});
```

When `generateOnSlugChange` is on, the plugin derives the old and new paths from
the updated entry type's `url` template (e.g. `url: '/blog/{slug}'`), the same
template that powers the admin **View** link. Entry types without a `url`
template are skipped, so the plugin never guesses a path.

An entry whose template names a value it doesn't have (an empty slug, or a
missing field in `/{category}/{slug}`) has no URL, so no redirect is recorded
for it.

Recording a redirect keeps the rules loop-free and one hop deep:

- An enabled rule whose **from** is the new path is deleted, because that path
  is live again. Changing a slug from `a` to `b` and back to `a` leaves no rule
  for `/blog/a`.
- Enabled rules that pointed at the old path are repointed at the new one.
  After `a` to `b` to `c`, both `/blog/a` and `/blog/b` redirect straight to
  `/blog/c`.
- An enabled rule that already redirects the old path is kept.
- A disabled rule at the old path is repointed at the new one and enabled,
  because a path holds one rule. Other disabled rules are left alone.

The hook's writes are separate statements: a plugin context offers no
transaction to group them in.

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
        return context.redirect(match.to, match.status === '301' ? 301 : 302);
    }
    return next();
});
```

(Combine with other middleware via Astro's `sequence()` as needed.)
