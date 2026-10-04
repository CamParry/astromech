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
- [ ] A test that a preview-token response is never stored.
