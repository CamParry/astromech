# demo-rating

A teaching plugin that demonstrates the **external-plugin** authoring format on
a small surface: a custom `rating` field type (1–5 stars, with a validator), a
component overview page, an auto-rendered settings form, a service method,
localized strings, and a declared permission.

It is structured exactly like a first-party plugin — see
[`apps/docs/plugins/authoring.md`](../../../../docs/plugins/authoring.md) for the
canonical convention — with one difference: it lives in the demo app rather than
a published package, so it declares `root: import.meta.url` and its relative
asset specifiers resolve against this directory instead of a package specifier.

## Layout

```
rating/
  index.ts                    definePlugin() — identity + composing the surfaces below
  permissions/rating.ts       definePermissions() — the grantable permission keys
  fields/rating.ts            the `rating` field-type registration + RATING_FIELD_TYPE
  admin/fields/rating-field.tsx  the field renderer (browser asset) + validate()
  pages/overview.ts           defineAdminPage — component view
  admin/pages/overview-page.tsx  the overview renderer (browser asset)
  pages/settings.ts           defineAdminPage — auto-rendered settings form
  service/describe.ts         an RPC method (the repo's only multi-word service key)
  locales/en.json             i18n bundle
```

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { rating } from './src/plugins/rating/index';

export default defineConfig({
    plugins: [rating()],
    // ...
});
```

## Using the field

Reference the registered field type by its `type` key anywhere a field is
declared:

```ts
{ name: 'contentQuality', type: 'rating', label: 'Content Quality' }
```

## Identity

`package: 'demo-rating'` is the only identifier declared. Everything else
derives from it, and this plugin is the demo's one **multi-word** example, so it
is where the two derived forms are actually distinguishable:

| form        | value         | where it appears                                     |
| ----------- | ------------- | ---------------------------------------------------- |
| namespace   | `demo_rating` | permissions, settings keys, i18n, admin URLs         |
| service key | `demoRating`  | `Astromech.plugins.demoRating`, `/cms/api/plugins/…` |

## Permissions

The plugin declares one permission, `view`. The factory's `permissions()`
accessor returns it already namespaced, as `plugin:demo_rating:view`. There are
no bundles — a role names the keys it grants:

```ts
roles: {
    'content-editor': {
        permissions: [...permissionsForBuiltInRole('editor'), ...rating.permissions('view')],
    },
}
```

## Service method

```ts
const { fieldType, usedBy, max } = await Astromech.plugins.demoRating.describe();
```

Addressed by the service key in both transports — locally as above, and over
HTTP as `POST /cms/api/plugins/demoRating/describe`. The namespace form
(`demo_rating`) is not a route and 404s.

## Admin surface

- **Overview** — `/cms/plugin/demo_rating/overview` (requires
  `plugin:demo_rating:view`).
- **Settings** — `/cms/plugin/demo_rating/settings`, an auto-rendered form for
  `minimumQuality` and `showInListing`.
