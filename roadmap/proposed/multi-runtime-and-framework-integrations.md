# Multi-Runtime & Framework Integrations

Serve Astromech from a host other than Astro. Decided 2026-10-03; stays in
`proposed/` until a site needs a non-Astro host.

## What exists

- `createAstromech({ config })` (`packages/astromech/src/astromech.ts`) boots
  once per process and returns `app.fetch(request)`, which serves every API and
  media route, plus `app.scheduled()` and `app.startScheduler()`. The Astro
  integration is a middleware and a catch-all route that calls `app.fetch`
  (`packages/astromech/src/integrations/astro/handler.ts`).
- `createWorkerEntry` (`astromech/cloudflare`) wraps any framework's Worker.
- Bun and Deno serve fetch handlers natively, and drivers are named in config
  (`libsql()`, `d1()`), so there is no runtime to detect.
- The admin is compiled by the site's own Vite build: `shell.astro` and
  `main.tsx` with plugin admin components, the icon virtual module and the
  TanStack Router plugin (`packages/admin/src/vite.ts`). A host without Vite
  cannot do that.

`roadmap/completed/runtime-boot-and-live-config.md` settled how the config
reaches the server under Astro: as a live module, never serialised.

## Prior art

- **Better Auth** has one `auth.handler(request)` and a small helper per
  framework (`toNextJsHandler`, `svelteKitHandler`, `toNodeHandler`), with no
  shared integration type.
- **Keystatic** ships `@keystatic/astro`, `@keystatic/next` and a Remix package:
  each is an API route handler plus the admin as a React page the host mounts.
- **Payload** puts the admin inside the user's Next app: `withPayload()` in
  `next.config`, a `@payload-config` path alias, route files
  `create-payload-app` copies into `app/(payload)/`, and `getPayload({ config })`
  caching the instance.
- **Strapi** (`strapi build`) and **Sanity** (`sanity build`) build the admin
  with its plugins into static files. Sanity can also embed the studio in Next.

## Decided

- **No integration types and no runtime detection.** The contract is
  `createAstromech` plus `app.fetch` and `app.scheduled`, documented in
  `apps/docs`. Each integration is a small helper, as in Better Auth. Rejected:
  `RuntimeIntegration` and `FrameworkIntegration` types, and a
  `support/runtime.ts` detector.
- **A host without Vite gets the admin from `astromech build`**, a CLI step that
  builds the admin and the site's plugins with Vite into static files that
  `app.fetch` serves. Astro keeps building the admin itself. Rejected: one
  prebuilt admin, which cannot include a site's plugins; and an admin build per
  bundler.
- **The config arrives through the author's own files.** The integration's docs
  tell the author to write a route file that imports their config and calls
  `createAstromech`, as Payload and Keystatic do. Nothing is injected.
- **Order:** `astromech/node`, a standalone server for headless use, which proves
  the three decisions above; then `astromech/next`; SvelteKit on demand.
- **Subpaths with optional peer dependencies** (`astromech/node`,
  `astromech/next`), like `astromech/astro` and `astromech/cloudflare`.

## The work

- [ ] Document the contract: `createAstromech`, `app.fetch`, `app.scheduled`,
      the request scope, and which cron driver each host uses.
- [ ] `astromech build`: the admin and plugins as static files, served by
      `app.fetch`.
- [ ] `astromech/node`: a standalone Node and Bun server.
- [ ] `astromech/next`: a route handler helper and the files the author adds.
- [ ] `astromech/sveltekit`, on demand.

## Open questions

- **Sessions across origins** for the admin bar (`planned/admin-bar.md`): lean
  towards Sanity's handshake over the existing preview tokens rather than
  Payload's cross-site cookie. Settle it when the Next work starts.
