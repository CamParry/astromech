# @astromech/seo

Search metadata for any entry type: a `seo-meta` field (meta title +
description with length recommendations and a search preview), an SEO health
dashboard, a default Open Graph image setting, and public `sitemap` / `meta`
SDK methods. Non-AI affordances only — AI metadata writing is a future phase.

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { seo, seoFields } from 'astromech/plugins/seo';

export default defineConfig({
    plugins: [seo()],
    entries: {
        page: {
            // ...
            fieldGroups: [
                mainFields,
                seoFields(), // adds the SEO tab to the edit page
            ],
        },
    },
});
```

Attachment is explicit composition: the plugin never injects fields. Every
entry type whose `fieldGroups` include `seoFields()` is part of the plugin's
_footprint_ — the SEO overview dashboard and the `sitemap` method cover
exactly those types.

### Options

```ts
seo({
    // Map an entry to the public path it is served at (used by `sitemap`
    // and `meta`). Return null to skip. Default: `/${slug}`.
    pathForEntry: ({ type, slug }) => (slug ? `/${type}/${slug}` : null),
});

seoFields({
    // Where the group renders on the edit page. Default: 'tab'.
    placement: 'sidebar',
    label: 'Search',
    priority: 10,
});
```

## Admin surface

- **Edit page** — `seoFields()` adds an SEO tab with the `seo-meta` field:
  meta title and description inputs with live character counters,
  length-recommendation hints (title 30–60, description 70–160 characters),
  and a search-result preview.
- **Overview dashboard** — `/admin/plugin/seo/overview` (requires the
  `plugin:astromech-seo:view` permission) shows SEO health totals and a
  per-entry breakdown across the footprint.
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

`meta` resolves one published entry's metadata with fallbacks: the entry
title when no meta title is set, and the default OG image setting:

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
