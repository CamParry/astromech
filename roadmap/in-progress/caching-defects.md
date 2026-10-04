---
milestone: 1.0
---

# Caching defects

Found on 2026-10-04 while planning `roadmap/planned/page-caching.md`, which
needs these fixed first. None has been run; write a failing test first.

- **Admin, API and media responses can be cached.** The admin shell, the
  `${basePath}/api/*` routes and the media route send no `private`, and nothing
  calls `cache.set(false)` for them
  (`packages/astromech/src/integrations/astro/routes.ts`). A site's broad
  `routeRules` pattern would serve one user's API response to everyone, since
  no cache provider keys on cookies. The admin shell also varies on the
  `am-theme` cookie.
- **Media responses without cache headers.** The 302 to the canonical variant
  and the 404 send no `Cache-Control`
  (`packages/astromech/src/media/serving/handler.ts`); variants are immutable
  for a year with no cache tag, so a clear cannot reach them on a CDN.
- **The middleware boots the app and starts the scheduler while prerendering**
  (`packages/astromech/src/integrations/astro/middleware.ts`), so a long build
  can run scheduled publishes against the production database.
- **Migrations run after prerendering.** `astro:build:done`
  (`packages/astromech/src/integrations/astro/integration.ts`) migrates after
  prerendered pages have read the database.
- **`scheduled()` drops the Worker's `ctx`**
  (`packages/astromech/src/integrations/cloudflare/worker.ts`), so work after a
  tick, such as a cache purge, has no `waitUntil`.
- **Preview tokens travel in the query string**
  (`packages/admin/src/components/entries/entry-edit-page.tsx`), which is part
  of Astro's cache key; a preview cached by mistake would outlive the token.
  The personal-response rule in `page-caching.md` covers it; a test proves it.

The class: a response or a job that assumed no cache and no build step.

## The work

- [x] `set(false)` and `private, no-store` on Astromech's own routes.
- [x] Media: `Cache-Control` on the 302 and the 404; the cache tag on variants.
- [x] No scheduler and no app boot for a prerendered page.
- [x] Migrations before prerendering, or a documented build order.
- [x] Pass `ctx` through `scheduled()`.
- [x] A test that a preview-token response is never stored.

## Checks on Cloudflare

Merged on 2026-10-04 and run on local workerd (`check:boot:cloudflare`, which
fires a `scheduled()` tick); these need a deployed Worker.

- [ ] `ctx.waitUntil` holds a tick started by a real Cron Trigger.
- [ ] Cloudflare's cache honours `Cache-Tag: astromech:media:<id>` with the
      media `Cache-Control`, and a purge by that tag reaches every variant.
- [ ] With `cacheCloudflare()`, nothing is stored for the admin, the API, a
      media 404 or a preview read (`cache.set(false)`).
- [ ] `astro build` migrates at build start and `disposeBindings()` releases
      the local D1 before the prerenderer opens it, on a site with prerendered
      pages (neither demo has one).

## Left open

- **Nothing purges a media item's tag.** Every media response carries
  `Cache-Tag: astromech:media:<id>`, but a replace or delete clears nothing;
  the media writes in `page-caching.md` are where a purge would go.
- **Astro's memory provider removes `Cache-Tag`** from every response it
  handles (`astro/dist/core/cache/handler.js`), so a Node site with
  `memoryCache()` and a CDN in front sends the CDN no media tag.
- **A preview read in a streamed component is missed.** The middleware sees
  the request scope's `noStore` once Astro hands it the response; a read in a
  component rendered after that does not reach the headers. The docs say to
  read in the page's frontmatter.
- **Non-GET requests** are not marked yet; `page-caching.md` adds them to the
  same `noStore` rule.
