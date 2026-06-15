# Demo Marketing Site (Phase 27c–f) — shared contract

The demo becomes an Astromech-markets-Astromech marketing site. Front-end is plain
(Tailwind utilities, grayscale). This file is the SHARED contract: block catalog +
entry types + globals page + routes. Config, seed, and front-end agents all build
against these exact names so block `type` strings, field names, and url templates
line up across schema → seed → components.

Menus note: per decision, menus are SIMPLE REPEATERS inside the globals settings
page for now (not the Menus plugin — that port is deferred to 27b later).

## Block catalog

A single reusable blocks field used by `page` (and `caseStudy` body):
`fields.blocks('content', { blocks: [ ...catalog ] })`. Each `type` maps 1:1 to an
Astro component `demo/src/components/blocks/<Type>.astro` via a `<Blocks>` dispatcher.

| type | fields |
|------|--------|
| `hero` | `heading` text (req), `subheading` textarea, `cta` link, `image` media |
| `richText` | `body` richtext (req) |
| `featureGrid` | `heading` text, `features` repeater[`title` text, `description` textarea, `icon` text] |
| `media` | `image` media (req), `caption` text |
| `cta` | `heading` text, `text` textarea, `button` link |
| `testimonial` | `quote` textarea (req), `author` text, `role` text, `avatar` media |
| `logoCloud` | `heading` text, `logos` media (multiple) |
| `faq` | `heading` text, `items` repeater[`question` text, `answer` textarea] |
| `stats` | `items` repeater[`value` text, `label` text] |
| `twoColumn` | `left` richtext, `right` richtext |

Give each block a sensible lucide `icon`. Block runtime shape:
`{ type, disabled?, _id, ...fields }` (see existing blocks-field typegen).

## Entry types (demo/astromech.config.ts)

All content types translatable. Keep `media`/`users` configs as-is.

- **page** — `url: '/{slug}'`. main: `blocks('content', catalog)`, then a `tabs` with an
  `seo` tab (`seoSection()`) + a `social` tab (`text('ogTitle')`, `media('ogImage')`,
  rating `contentQuality`). sidebar: `section('settings')` → `relationship('parent', { target:'page' })`,
  `boolean('noindex', { translatable:false })`, `color('themeColor', { translatable:false })`.
  versioning on.
- **post** — `url: '/blog/{slug}'`. main: `richtext('body', { required:true })`,
  `textarea('excerpt')`, `date('publishedDate')`, `seoSection()`. sidebar:
  `section('taxonomy')` → `media('featured_image', { translatable:false })`,
  `relationship('category', { target:'category', inverse:'post' })`,
  `relationship('tags', { target:'tag', multiple:true, inverse:'post' })`,
  `relationship('author', { target:'author', inverse:'post' })`. versioning on; views list+grid.
- **author** — title field = name. `url: '/authors/{slug}'`. main: `richtext('bio')`,
  `text('role')`, `repeater('socials', { fields:[ select('platform',{options:['twitter','github','linkedin','website']}), url('url') ] })`.
  sidebar: `media('avatar', { translatable:false })`.
- **caseStudy** (replaces `showcase`) — `url: '/customers/{slug}'`. main:
  `text('customer', { required:true })`, `select('industry', { options:['saas','ecommerce','agency','media','education'] })`,
  `textarea('summary')`, `blocks('content', catalog)`,
  `repeater('metrics', { fields:[ text('value'), text('label') ] })`,
  `group('quote', { fields:[ textarea('text'), text('author'), text('role') ] })`,
  rating `{ name:'contentQuality', type:'rating' }`, `seoSection()`. sidebar:
  `media('logo', { translatable:false })`, `media('gallery', { multiple:true, translatable:false })`,
  `relationship('related_posts', { target:'post', multiple:true })`.
- **category** — `url: '/blog/category/{slug}'`. fields: `textarea('description')`.
- **tag** — `url: '/blog/tag/{slug}'`. fields: `color('color')`.

Field-type coverage goal: text, textarea, richtext, media (single+multiple), relationship
(single+multiple+inverse+self), select, repeater, blocks, group, link, url, date, boolean,
color, tabs/tab, section, plus the plugin `rating` and SEO's composed `seoSection()`. Don't force unused types
awkwardly; note any not covered.

## Globals settings page (defineSettingsPage)

```ts
admin: { pages: [ defineSettingsPage({
  path: 'globals', label: 'Globals', icon: 'Settings', translatable: true,
  fields: [
    section('brand', { fields: [ text('siteName'), text('tagline'), media('logo', { translatable:false }) ] }),
    section('navigation', { fields: [
      repeater('mainMenu',   { fields: [ text('label'), text('href') ] }),
      repeater('footerMenu', { fields: [ text('label'), text('href') ] }),
    ] }),
    section('footer', { fields: [ textarea('footerText'), text('copyright', { translatable:false }) ] }),
    section('social', { fields: [ repeater('socials', { fields: [ text('platform'), url('url', { translatable:false }) ] }) ] }),
  ],
}) ] }
```

Front-end reads it via `Astromech.settings.get('globals', { locale })`.

## Front-end (demo/src)

SSR via `astromech/local` (the integration runs the demo server-side; new public pages
read the DB directly). Add `@astrojs/node` adapter + `output: 'server'` if needed for
`astro build`; dev (`astro dev`, port 4323) is the primary verify target.

- Tailwind (utilities only, grayscale). Astro 6 + `@tailwindcss/vite`.
- `demo/src/layouts/Site.astro` — html shell, `<Seo>` head, header (nav from globals
  mainMenu + logo/siteName), footer (footerMenu + footerText + socials), locale switcher.
- `demo/src/components/Seo.astro` — title/description/og via `Astromech.plugins.seo.meta`
  + `hreflang` alternates from `entry.locales`.
- `demo/src/components/blocks/` — one component per block type + `Blocks.astro` dispatcher.
- `demo/src/lib/astromech.ts` — small helpers: active-locale resolution from path,
  per-locale slug lookup, `localizedPath()`.
- i18n: default locale `en` unprefixed, others under `/[locale]/...`. Tiny UI-string dict
  for chrome ("Read more", "Published").

### Routes (locale-aware: each also under `/[locale]/...`)
- `/[...slug]` — pages by slug (lowest priority catch-all)
- `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/tag/[slug]`
- `/customers`, `/customers/[slug]`
- `/sitemap.xml` — `Astromech.plugins.seo.sitemap` (+ per-locale alternates)
- `src/middleware.ts` — `Astromech.plugins.redirects.lookup` → redirect when matched
- Replace the current `index.astro` (homepage becomes the `home` page entry rendered via blocks)

## Seed (demo/seed.ts, run via `astromech seed`)

Realistic bilingual-ish content (en primary; a couple fr translations to prove i18n):
home (blocks: hero/featureGrid/logoCloud/testimonial/cta), features & pricing & about pages,
~6 posts across categories/tags, 2–3 authors, 2–3 caseStudies, the `globals` settings
values (incl. mainMenu/footerMenu/socials), a few redirects. Use the SDK
(`astromech/local`) or direct repositories — match how any existing seed/CLI writes data.
