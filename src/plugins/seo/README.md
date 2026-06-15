# @astromech/seo

Search metadata for any entry type: a composed `seo` field group (meta title +
description with length recommendations and a search preview), an SEO health
dashboard, a default Open Graph image setting, and public `sitemap` / `meta`
SDK methods. Non-AI affordances only — AI metadata writing is a future phase.

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';
import { seo, seoSection } from 'astromech/plugins/seo';

export default defineConfig({
    plugins: [seo()],
    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            url: '/{slug}', // lets `sitemap` / `meta` resolve this type's paths
            fields: [
                // ...your fields
                seoSection(), // adds the SEO field group
            ],
        },
    },
});
```

Attachment is explicit composition — the plugin never injects fields. Every
entry type whose `fields` include `seoSection()` is part of the plugin's
_footprint_; the overview dashboard and the `sitemap` method cover exactly
those types. Drop `seoSection()` inside a `fields.tab(...)` to give it its own
tab on the edit page.

```ts
seoSection({ label: 'Search' }); // section heading; defaults to a localized "SEO"
```

## Paths

`seo()` takes no options. The `sitemap` and `meta` methods derive each entry's
public path from its entry type's `url` template (e.g. `url: '/blog/{slug}'`) —
the same template that powers the admin **View** link and redirect generation.
Entry types without a `url` template are skipped, so SEO never guesses a path.

## Permissions

The plugin exposes `seoPermissions` bundles for composing into roles:

- `view` — read the SEO overview dashboard

These resolve to `plugin:astromech-seo:view`.

```ts
// astromech.config.ts
import { builtInRole } from 'astromech';
import { seo, seoPermissions } from 'astromech/plugins/seo';

export default defineConfig({
    plugins: [seo()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [...builtInRole('editor'), ...seoPermissions('view')],
        },
    },
});
```

## Admin surface

- **Edit page** — `seoSection()` adds the `seo` field group: meta title and
  description inputs with live character counters
  (title 30–60, description 70–160 characters), and a search-result preview.
- **Overview dashboard** — `/admin/plugin/seo/overview` (requires
  `plugin:astromech-seo:view`) shows SEO health totals and a per-entry
  breakdown across the footprint.
- **Settings** — `/admin/plugin/seo/settings` holds the default Open Graph
  image, returned by `meta` when an entry has no image of its own.

## Sitemap (recipe)

The plugin exposes **data**; your app owns the route. The `sitemap` method is
`public` and returns the published entries across the footprint:

```ts
// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { Astromech } from 'astromech/local';

const SITE = 'https://example.com';

export const GET: APIRoute = async () => {
    const { urls } = await Astromech.plugins.seo.sitemap();
    const body =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls
            .map(
                (url) =>
                    `<url><loc>${SITE}${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`
            )
            .join('\n') +
        '\n</urlset>';
    return new Response(body, {
        headers: { 'Content-Type': 'application/xml' },
    });
};
```

## Meta tags (recipe)

`meta` resolves one published entry's metadata with fallbacks: the entry title
when no meta title is set, and the default OG image setting:

```astro
---
// src/pages/[slug].astro
import { Astromech } from 'astromech/local';

const meta = await Astromech.plugins.seo.meta({
    type: 'page',
    slug: Astro.params.slug,
});
---

<head>
    <title>{meta?.title}</title>
    {meta?.description && <meta name="description" content={meta.description} />}
    {meta?.ogImage && <meta property="og:image" content={meta.ogImage} />}
</head>
```

Both methods also work over HTTP (`astromech/fetch` or
`POST /api/plugins/seo/{method}`) for decoupled frontends.
