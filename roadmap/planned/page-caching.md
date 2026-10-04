---
milestone: 1.0
---

# Page caching and invalidation

A site's pages render on every request, and nothing tells a cache that content
changed. Raised on 2026-10-03 from WPMU DEV Hummingbird; decided 2026-10-04.

Prerequisite: `roadmap/completed/caching-defects.md`. Builds on
`roadmap/planned/drafts.md` and `roadmap/planned/schedules.md`.

## What exists

- The media route sends immutable headers for variants and short-lived ones for
  originals and the redirect, `no-store` on a 404, and a
  `Cache-Tag: astromech:media:<id>` on each item's responses
  (`packages/astromech/src/media/serving/handler.ts`). Site pages get no
  `Cache-Control` and no cache tags.
- The middleware (`packages/astromech/src/integrations/astro/middleware.ts`)
  calls `cache.set(false)` last on the admin, API and media routes and on a
  page whose request scope a preview read marked `noStore`, and sends
  `private, no-store` on all but media. A prerendered page boots nothing.
- Astro 7's route caching is stable (the repo has 7.3.2): `Astro.cache.set`
  and `routeRules` set a lifetime and tags, `cache.invalidate({ tags })` clears
  them, with `memoryCache()` on Node and `cacheCloudflare()` on Workers.
- Three facts from Astro's source shape the design:
    - The cache wraps the whole middleware chain
      (`astro/dist/core/routing/handler.js`), so on a hit no middleware runs:
      not Astromech's, not the redirects lookup.
    - Neither provider puts cookies in the cache key, so a signed-in visitor gets
      the anonymous copy. Both refuse a response that sets a cookie.
    - `set(false)` is undone by any later `set()`, and there is no public API to
      invalidate outside a request (EmDash reaches the provider through the
      app's manifest).

## Prior art

- **Targeted clearing misses pages.** On a post update, Hummingbird clears the
  post and its category, tag and author archives but not the home page, with
  an opt-in "Clear full cache when post/page is updated"; WP Rocket clears a
  hand-kept list (the post, archives, the blog index, the home page, adjacent
  posts, feeds) that misses any other page showing the post; LiteSpeed has the
  site owner tick page types, with "All pages" off by default.
- **Ghost clears everything** (`/*`) whenever published content changes, and
  only the preview URL for a draft.
- **EmDash** tags pages through hints its reads return, and clears by
  collection and id.
- **Cloudflare's Workers cache** purges by tag, at Free-plan limits on every
  plan: 5 purges a minute, bursts of 25, 100 tags a call. Its key includes the
  Worker version, so each deploy starts empty.

## Decided (2026-10-04)

- **Any change to live content clears the whole cache.** Every cached response
  carries one tag, and a write that changes what a public read returns clears
  it. Rejected: per-entry, per-type and per-query tags, which still miss pages
  (a related-posts block, a home-page list) and need tag caps; and WordPress
  plugins' lists of pages to clear. The cost, every page rendering again after
  each publish, is accepted for 1.0. Targeted tags can come later without
  changing the site-facing API.
- **Which writes clear it** is declared on the method object beside `mutates`,
  because version restore, staging merge and media writes fire no hooks. They
  are: publish, unpublish, trash, restore, delete and move of entries; the same
  for globals; media update, replace and delete; locale settings; redirect
  rules; and plugin writes through a `ctx` helper. Draft saves and edits to
  unpublished content do not. Clearing runs once per request, after the write
  commits, and once at the end of each cron tick that ran a schedule.
- **The site sets lifetimes.** Astromech tags responses and clears them; how
  long a page lives comes from the site's `routeRules` or `Astro.cache.set`.
  Astromech sets no `maxAge`, so a form or search page is never cached without
  the developer choosing it.
- **Off by default.** Nothing is cached until the site configures an Astro
  cache provider; once it does, Astromech tags and clears. The docs give a
  `routeRules` example (EmDash uses `maxAge: 3600, swr: 864000`).
- **Personal responses are never cached.** A read with a preview token, and any
  request that is not a GET (live preview is a POST), marks the request
  scope; after the page renders, the middleware calls `cache.set(false)` last
  and sends `Cache-Control: private, no-store`. Non-200 responses are not
  cached. The admin bar loads from a script (`roadmap/planned/admin-bar.md`).
  Signed-in visitors need no bypass: site reads are the same for every user.
- **"Clear cache"** in the admin and the admin bar clears the tag, behind a new
  `cache:clear` permission granted to admins (Blitz has `blitz:clear`).
- **Cloudflare:** `cacheCloudflare()` is supported, documented as experimental
  in Astro, and turned on in `apps/demo-cloudflare`. A purge refused by the
  rate limit is retried on the next tick.
- **Node with several processes:** `memoryCache` is per process, so a clear
  reaches only the process that made the write. The docs say to run one
  process or use a short `maxAge`. Purging a CDN in front of a Node site is a
  plugin after 1.0.
- **Static builds are not supported for content pages in 1.0.** `getAstromech()`
  throws in a prerendered page and its `getStaticPaths`, since the middleware
  boots no application for one, and on Cloudflare prerendering would need
  remote D1. `apps/docs/deployment/caching.md` covers `prerender = true` for
  pages that read no content.
  Deploy hooks that rebuild a static site are `roadmap/proposed/webhooks.md`.
- **Headers are left to Astro's providers.** Astromech sends only
  `private, no-store`, and never a browser `max-age` on HTML, which a clear
  cannot reach.

**After 1.0, as plugins:** targeted tags, purging a CDN for a Node site,
warming the cache from the sitemap.

**Left to Astro and the platform:** minifying, bundling, critical CSS, fonts,
compression and the CDN.

## The work

- [ ] The middleware tags every response, applies `set(false)` and
      `private, no-store` to personal ones, and clears once per request.
- [ ] The clearing declaration on method objects, the `ctx` helper for plugins,
      and the clear at the end of a cron tick through a provider handle.
- [ ] Workers: purge through `cache.purge`, retry after a rate-limit refusal;
      turn it on in `apps/demo-cloudflare`.
- [ ] "Clear cache" and `cache:clear` in the admin and the admin bar.
- [ ] Docs: providers, `routeRules` examples, several Node processes, what
      prerendering supports.

## Testing

With `memoryCache`, a published change is visible on the next request to every
page; a draft save leaves the cache alone; a schedule running clears it; a
preview-token read and a POST are never stored; the admin, API and media
routes are never stored; a refused Workers purge is retried.
