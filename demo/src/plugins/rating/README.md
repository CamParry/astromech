# demo-rating

A teaching plugin that demonstrates the **external-plugin** authoring format on
a small surface: a custom `rating` field type (1–5 stars, with a validator), a
component overview page, an auto-rendered settings form, localized strings, and
a permission bundle.

It is structured exactly like a first-party plugin — see
[`apps/docs/plugins/authoring.md`](../../../../apps/docs/plugins/authoring.md) for the
canonical convention — with one difference: it lives in the demo app rather than
the published package, so it imports from `astromech` and resolves assets via
`fileURLToPath` instead of published module specifiers.

## Layout

```
rating/
  manifest.ts            identity (PACKAGE, VERSION, LABEL, ICON) + asset()/locales() helpers
  types.ts               domain constants (RATING_FIELD_TYPE)
  index.ts               thin definePlugin() composing the surfaces below
  permissions/rating.ts  ratingPermissions bundle + permission declarations
  fields/rating.ts       the `rating` field-type registration
  fields/rating-field.tsx   the field renderer (browser asset) + validate()
  pages/overview.ts      defineAdminPage — component view
  pages/overview-page.tsx   the overview renderer (browser asset)
  pages/settings.ts      defineAdminPage — auto-rendered settings form
  locales/en.json        i18n bundle
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

## Permissions

`ratingPermissions` exposes a `view` bundle, resolving to
`plugin:demo-rating:view`:

```ts
roles: {
    'content-editor': {
        permissions: [...builtInRole('editor'), ...ratingPermissions('view')],
    },
}
```

## Admin surface

- **Overview** — `/admin/plugin/rating/overview` (requires `plugin:demo-rating:view`).
- **Settings** — `/admin/plugin/rating/settings`, an auto-rendered form for
  `minimumQuality` and `showInListing`.
