---
milestone: later
---

# Request profiler

A dev-only view of what a single request spent its time on: the SQL queries it
ran and how long each took, the hooks it fired, the service methods it called.
The mental model is WordPress's Query Monitor, with the same job done by
Laravel Telescope and Symfony's Profiler: a per-request panel a developer opens
while building a site, not a production monitor.

This is deliberately separate from two things it is often confused with:

- **Boot timing** is a one-off-per-process concern, not per-request. It is
  obtained with a profiler when needed (`node --cpu-prof`, `clinic flame`), not
  instrumented in the code.
- **Production metrics** (cold-start times, error rates, request latency) come
  from the platform (Cloudflare Workers analytics) and a metrics tool like
  Sentry, not from anything Astromech renders itself.

## Decided (2026-10-02)

- **The name is "profiler"**, after Symfony's: the collected per-request data.
  "Monitoring" leans production, and "debug toolbar" names a view, not the data.
- **One span shape for every layer**, recorded into the request scope:
  `{ kind, name, ms, detail }`, where `kind` is `query`, `hook` or `method`.
  One renderer shows all three, and the shape is the `Server-Timing` header's
  name, duration and description.
- **API responses carry a `Server-Timing` header** through Hono's built-in
  `timing` middleware, so the browser's Network tab shows an admin call's spans.
- **Not the Astro Dev Toolbar.** It would tie the view to Astro, and the
  integrations in `multi-runtime-and-framework-integrations.md` need it
  detached. Where the spans render on site pages is the admin bar's question
  (`admin-bar.md`); in the admin, a top bar slot.

## Shape

- [ ] Request-scoped collector in the request scope
      (`packages/astromech/src/request-scope/request-scope.ts`), off unless
      enabled.
- [ ] Queries: Kysely's `log` option (`query.sql`, `query.parameters`,
      `queryDurationMillis`) on the instance each driver builds
      (`database/drivers/libsql.ts`, `database/drivers/d1.ts`), reading the
      current request from the scope.
- [ ] Hooks: time each handler in `runHook` (`hooks/hooks.ts`).
- [ ] Methods: time each call in `defineService`'s `bind`
      (`services/define-service.ts`), the path the audit trail logs from too.
- [ ] `Server-Timing` on API responses.
- [ ] The admin's top bar shows the current view's spans when profiling is on.
- [ ] Enable/disable gate: on in `astro dev` by default, never in production.
