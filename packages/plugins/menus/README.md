# @astromech/menus

Developer-declared navigation menus: each menu is configured up front (a
`key` and a `label`), stored as a translatable global the plugin generates,
and edited through that global's admin page — a nested tree of items, each pointing at
either an internal entry or an external URL. A public service method resolves
a menu into a clean tree, turning entry refs into front-end URLs along the
way.

## Layout

```
menus/
  index.ts               definePlugin() — identity + composing the surfaces below
  types.ts                MenuConfig / MenusOptions / MenuItem
  fields/menu-item.ts     menuItemFields — the node schema used at every depth of the tree
  globals/menus.ts        buildMenuGlobals() — one defineGlobal per configured menu, keyed `menu-<key>`
  service/menus.ts        createMenusService() — the public `get` service method
```

## Install

```ts
// astromech.config.ts
import { menus } from '@astromech/menus';
import { defineConfig } from 'astromech';

export default defineConfig({
    plugins: [
        menus({
            menus: [
                { key: 'main', label: 'Main Navigation' },
                { key: 'footer', label: 'Footer' },
            ],
        }),
    ],
});
```

Each configured menu gets its own global and its own admin page; there's no
shared "menus" list to sift through.

## Identity

`package: '@astromech/menus'` is the only identifier declared. The
`@astromech/` scope is stripped when deriving, and `menus` is already a single
word, so — unlike most plugins — the namespace and the service key come out
identical:

| form        | value   | where it appears                              |
| ----------- | ------- | --------------------------------------------- |
| namespace   | `menus` | global keys, permissions, admin URLs          |
| service key | `menus` | `Astromech.plugins.menus`, `/api/plugins/...` |

## Service method

```ts
const items = await Astromech.plugins.menus.get({ key: 'main', locale: 'en' });
// → MenuItem[] | null
```

`get` is `access: 'public'`, so it's safe to call from the front end. It
returns `null` for an unconfigured key and `[]` for a configured menu with no
items yet. Disabled nodes are dropped, and each item's `url` is resolved from
either its `entry` reference (via the entry type's `url` template) or its
literal `url` field. Addressed the same way over HTTP, as
`POST /api/plugins/menus/get`.

## Admin surface

One global edit page per configured menu, at
`/cms/plugin/menus/globals/menu-<key>` — a `fields.tree('items', ...)` editor
for the menu's nested items.

## Permissions

`menus` declares no permissions of its own. Its service method is `public`,
and each menu's global carries the standard global permissions, such as
`plugin:menus:global:menu-main:read` and `plugin:menus:global:menu-main:update`,
so editing one menu can be granted without the others.
