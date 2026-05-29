# @astromech/redirects

Manage URL redirects as a first-class entry type, look them up from anywhere
via the SDK, and (optionally) auto-create a redirect whenever an entry's slug
changes.

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
`from`, `to`, `status` (301/302), and `enabled` fields.

## Looking up a redirect

The `lookup` method is `public` and works identically over the local DB
(`astromech/local`) and HTTP (`astromech/fetch`):

```ts
import { Astromech } from 'astromech/local';

const match = await Astromech.plugins.redirects.lookup({ from: '/old-path' });
// → { to: '/new-path', status: '301' } | null
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
