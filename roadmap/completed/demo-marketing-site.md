# Demo Marketing Site

Dogfoods the public APIs end-to-end — Astromech marketing Astromech.

- [x] App-defined **Globals** settings page (translatable): site name, tagline, logo, socials, footer, copyright; menus shipped as 2-level nested repeaters (`mainMenu`/`footerMenu`), read via `settings.get('globals', { locale })`
- [x] Config refactor: `author` + `caseStudy` entry types, blocks-based `page`, archive URLs, custom `rating` field plugin; all 24 field + 4 layout types exercised
- [x] Front-end: Tailwind (utilities only, grayscale), `<Blocks>` dispatcher + catalog (hero, richText, featureGrid, media, cta, testimonial, logoCloud, faq, stats, twoColumn), locale-aware layout/nav/footer, `<Seo>` head with `hreflang` alternates, front-end UI-string dictionary
- [x] Locale-aware routes (`/[...path]`, `/blog`, `/blog/[slug]`, `/blog/category|tag/[slug]`, `/customers`, `/customers/[slug]`); `/sitemap.xml`; redirects middleware (`demo/src/middleware.ts`); SSR via `astromech/local` + `.populate()`
- [x] Realistic seed content (`demo/seed.ts`): pages, ~7 posts, 3 case studies, authors, taxonomy, menus, globals, redirects, FR translations

> The demo's Globals-repeater menus were a stop-gap; the dedicated `@astromech/menus` plugin (settings-page + `tree` field) replaces them — see Menus, `tree` field & clean settings translation below.
