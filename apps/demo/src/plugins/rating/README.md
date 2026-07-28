# demo-rating

A teaching plugin that demonstrates the **external-plugin** authoring format on
a small surface: a custom `rating` field type (1–5 stars, with a validator), a
component overview page, an auto-rendered settings form, an SDK method,
localized strings, and a permission bundle.

It is structured exactly like a first-party plugin — see
[`apps/docs/plugins/authoring.md`](../../../../apps/docs/plugins/authoring.md) for the
canonical convention — with one difference: it lives in the demo app rather than
a published package, so it declares `root: import.meta.url` and its relative
asset specifiers resolve against this directory instead of a package specifier.

## Layout

```
rating/
  types.ts                    domain constants (RATING_FIELD_TYPE)
  index.ts                    definePlugin() — identity + composing the surfaces below
  permissions/rating.ts       ratingPermissionBundles + permission declarations
  fields/rating.ts            the `rating` field-type registration
  admin/fields/rating-field.tsx  the field renderer (browser asset) + validate()
  pages/overview.ts           defineAdminPage — component view
  admin/pages/overview-page.tsx  the overview renderer (browser asset)
  pages/settings.ts           defineAdminPage — auto-rendered settings form
  sdk/describe.ts             an RPC method (the repo's only multi-word SDK key)
  locales/en.json             i18n bundle
```

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { rating } from './src/plugins/rating/index.js';

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

| form      | value         | where it appears                                 |
| --------- | ------------- | ------------------------------------------------ |
| namespace | `demo_rating` | permissions, settings keys, i18n, admin URLs     |
| SDK key   | `demoRating`  | `Astromech.plugins.demoRating`, `/api/plugins/…` |

## Permissions

The plugin factory exposes a `view` bundle, resolving to
`plugin:demo_rating:view`:

```ts
roles: {
    'content-editor': {
        permissions: [...builtInRole('editor'), ...rating.permissions('view')],
    },
}
```

## SDK method

```ts
const { fieldType, usedBy, max } = await Astromech.plugins.demoRating.describe();
```

Addressed by the SDK key in both transports — locally as above, and over HTTP as
`POST /api/plugins/demoRating/describe`. The namespace form (`demo_rating`) is
not a route and 404s.

## Admin surface

- **Overview** — `/admin/plugin/demo_rating/overview` (requires
  `plugin:demo_rating:view`).
- **Settings** — `/admin/plugin/demo_rating/settings`, an auto-rendered form for
  `minimumQuality` and `showInListing`.
