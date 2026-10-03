# Page caching and invalidation

A site's pages render on every request, and nothing tells a cache that content
changed. Raised on 2026-10-03 from WPMU DEV Hummingbird. **Target: 1.0.**

Astromech's media route already sends immutable headers for variants and
short-lived ones for originals
(`packages/astromech/src/media/serving/handler.ts`). Site pages get no
`Cache-Control` or cache tags.

## Prior art

- **Astro 7** (the repo is on `^7.2.1`) has stable route caching:
  `Astro.cache.set(...)` with tags on a page, `cache.invalidate({ tags })`
  after a write, `memoryCache()` on Node, and `cacheCloudflare()` on Workers
  (still experimental).
- **EmDash** uses it this way: reads return a cache hint, pages pass it to
  `Astro.cache.set`, and admin writes invalidate by collection and id.
- **Statamic** static caching invalidates on save, including when scheduled
  content goes live. **Craft's Blitz** and **WordPress cache plugins** clear
  related pages on update and offer a "clear cache" button.
- **Payload** puts `revalidateTag` in its website template's hooks, not in
  core.
- **Cloudflare:** purge by tag, prefix, host or everything is on every plan
  (the Free plan is limited to 5 requests a minute). Workers Cache honours
  `CDN-Cache-Control` and `Cache-Tag`, and caches requests that carry cookies
  unless the response sets one.

## Proposal

- **Reads return cache tags** per entry, entry type, global and media item,
  plus one site-wide tag, and every write invalidates its tags after commit.
- **Scheduled publishing and unpublishing invalidate** from the cron job,
  since nothing is written when a scheduled entry goes live.
- **Personal responses are never cached:** previews, admin-bar pages and
  signed-in reads send `private, no-store` and skip `cache.set`.
- **A "Clear cache" action** in the admin and in `roadmap/planned/admin-bar.md`,
  using the site-wide tag.
- **Static builds checked and documented.** `ARCHITECTURE.md` says "SSR only",
  yet the injected routes are `prerender: false` and the middleware already
  skips the session for a prerendered page, so pages built ahead of time may
  work beside the on-demand admin. Check: `getStaticPaths` may run before the
  config is registered; the build needs the production database (on Cloudflare,
  remote D1 bindings); the scheduler starts during the build. The recommended
  default stays on-demand pages with route caching.

**After 1.0, as plugins:** purging Cloudflare's cache for a Node site behind
Cloudflare, by the same tags; deploy hooks that rebuild a fully static site
(`roadmap/proposed/webhooks.md`); warming the cache from the sitemap.

**Left to Astro and the platform:** minifying, bundling, critical CSS, fonts,
compression and the CDN.

## Open questions

- Does Astromech set the cache on a page itself (middleware), or does the page
  opt in with the hint a read returns, as EmDash does?
- How are purges batched on Workers, where `ctx.cache.purge` uses the Free
  plan's limits?
