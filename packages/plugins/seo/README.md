# @astromech/seo

Search metadata for any entry type: a composed `seo` field group (meta title +
description with length recommendations and a search preview), an SEO health
dashboard, a default Open Graph image setting, and public `getSitemap` / `getMeta`
service methods. Non-AI affordances only — AI metadata writing is a future phase.

## Install

```ts
// astromech.config.ts
import { seo, seoSection } from '@astromech/seo';
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    plugins: [seo()],
    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            url: '/{slug}', // lets `getSitemap` / `getMeta` resolve this type's paths
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
_footprint_; the overview dashboard and the `getSitemap` method cover exactly
those types. Drop `seoSection()` inside an unnamed tab,
`fields.tab({ label: 'SEO', fields: [seoSection()] })`, to give it its own tab
on the edit page. A named tab would store the group under the tab's name.

```ts
seoSection({ label: 'Search' }); // group heading; defaults to a localized "SEO"
```

## Paths

`seo()` takes no options. The `getSitemap` and `getMeta` methods derive each entry's
public path from its entry type's `url` template (e.g. `url: '/blog/{slug}'`) —
the same template that powers the admin **View** link and redirect generation.
Entry types without a `url` template are skipped, so SEO never guesses a path.

## Permissions

The plugin declares one permission, which the factory's `permissions()`
accessor returns already namespaced:

- `read` — read the SEO overview dashboard, i.e. `plugin:seo:read`

Nothing is granted automatically: `admin` holds `*` and so has it already,
every other role opts in by naming the key.

```ts
// astromech.config.ts
import { seo } from '@astromech/seo';
import { defineConfig, permissionsForBuiltInRole } from 'astromech';

export default defineConfig({
    plugins: [seo()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...permissionsForBuiltInRole('editor'),
                ...seo.permissions('read'),
            ],
        },
    },
});
```

## Admin surface

- **Edit page** — `seoSection()` adds the `seo` field group: meta title and
  description inputs with live character counters
  (title 30–60, description 70–160 characters), and a search-result preview.
- **Overview dashboard** — `/admin/plugin/seo/overview` (requires
  `plugin:seo:read`) shows SEO health totals and a per-entry
  breakdown across the footprint.
- **Settings** — `/admin/plugin/seo/settings` holds the default Open Graph
  image, returned by `getMeta` when an entry has no image of its own.

## Sitemap (recipe)

The plugin exposes **data**; your app owns the route. The `getSitemap` method is
`public` and returns the published entries across the footprint:

```ts
// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { getAstromech } from 'astromech';

const SITE = 'https://example.com';

export const GET: APIRoute = async () => {
    const app = await getAstromech();
    const { urls } = await app.plugins.seo.getSitemap();
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

`getMeta` resolves one published entry's metadata with fallbacks: the entry title
when no meta title is set, and the default OG image setting:

```astro
---
// src/pages/[slug].astro
import { getAstromech } from 'astromech';

const app = await getAstromech();
const meta = await app.plugins.seo.getMeta({
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
