# 0063 — Where the application reorganization landed differently from 0057

**Date:** 2026-08-18
**Status:** accepted

[0057](0057-one-application-instance-thin-framework-integrations.md) proposed one
application instance behind a memoised factory and a thin `integrations/` layer,
and the work shipped on that shape. Five of its specifics reversed during
implementation, worked out in
`specs/application-architecture-map.md` and settled as the stages landed. 0057's
central decision stands; this record holds the reversals so they are not
re-argued from the old text, and points to the records that already captured the
rest.

## createAstromech creates; getAstromech only reads

0057 made `getAstromech()` the memoised factory and the one front door, taking
the config on its first call. That is a trap: an argument honoured only on the
first call and ignored on every later one reads as configuration but is not.

The two jobs split, following Laravel (`bootstrap/app.php` creates, `app()` only
reads). `createAstromech({ config })` initialises and is idempotent — a second
call with the same config object returns the instance, a different one throws, a
failed boot clears the slot so the next caller retries. `getAstromech()` never
creates and throws when the slot is empty. Two functions that both initialise
would be two front doors, which is the disease 0057 set out to cure.

The asymmetry is why `create` is the forgiving one. Laravel gets one entry per
process, so "already created" cannot arise; a Cloudflare Worker exports `fetch`
and `scheduled` from one module sharing one isolate, and either can be first.
That is an environment fact, so a comment may state it. `TERMINOLOGY.md` holds
the pair; `boot/application.ts` is the code.

## config/ sits in the capabilities layer, not above the domains

0057 placed `src/config/` above the domains, reasoning that it validates their
declarations. Two facts make that wrong. Config readers are not only domains —
`cron/runner.ts`, `request-context/` and `users/auth.ts` all need config and all
sit below the domains, and anything placed above them fails for those readers,
which is exactly why `cron/registry.ts` grew a private `getRuntimeConfig` as a
workaround. And the pipeline has no real dependency on the domains: its six
domain imports were constants and pure `.shared` helpers, not behaviour.

Moving those six symbols down to leaves (`utilities/`, with two resolution steps
landing in `config/` itself) removed the inversion without an exemption, so
`config/` sits in the capabilities layer beside `database`, `storage` and the
rest. `.dependency-cruiser.cjs` `LAYERS` records the placement.

## The CLI supplies config; the virtual: shim is deleted

0057 kept the CLI's `virtual:astromech/config` shim as environment. That
contradicted the record's own config-at-boot rule: the shim's `rawConfig` was a
Proxy that threw on every read and whose `set` trap could mutate live config.
Supplying config is what makes the shim unnecessary, so it went, along with the
`cliConfig` global. The CLI and MCP call `createAstromech({ config })` like every
other entry, and the only `virtual:` importers left are the entry files that
supply config.

## One basePath replaces adminRoute and apiRoute

0057 left the two route keys alone. They became one `basePath` (default `/cms`),
with the admin at `${basePath}` and the API derived at `${basePath}/api`. Two
reasons: `apiRoute` defaulted to `/api`, squatting on a path plenty of Astro
sites want for their own endpoints; and one operator prefix collapses the
injected route patterns toward one. `mediaRoute` stays on its own top-level
prefix — a WAF rule, CDN bypass or `robots.txt` disallow on `/cms/*` to protect
the admin must not break every image on the public site, and admin and media
carry opposite cache policies that one prefix cannot hold. `TERMINOLOGY.md`
distinguishes `basePath` from the admin's SPA pages. This is a breaking config
change; `apps/demo` and `apps/docs` moved with it.

## The Hono app is built at boot, at absolute paths

0057 left `app.fetch` unspecified and Astro injecting three route files. The Hono
app was constructed at module scope, before any config existed, which is why its
routes registered at bare paths, why `routes/api.ts` performed URL surgery to
strip the base, and why every middleware read `Astromech.config` lazily from
inside the handler. `createHttpApp(config)` now builds it during boot and
registers routes at their real absolute paths from the resolved config. No
`basePath()` call, no rewriting, and the two-prefix case (API and media) falls
out without a special case. Astro injects two patterns pointing at one one-line
handler, and `app.fetch(request)` is the single terminal entry point. Better
Auth (`${basePath}/api/auth/*`) and media (`${mediaRoute}/*`) mount inside it, so
one handler owns every Astromech URL.

## What the neighbouring records already hold

The rest of the reversals landed with their own records as the stages shipped:

- [0059](0059-the-worker-entry-is-a-cloudflare-integration.md) — the Cloudflare
  `scheduled()` entry became `createWorkerEntry` in `integrations/cloudflare/`.
- [0060](0060-exports-conditions-agree-within-an-entry.md) — the `exports`
  dev-condition trap the reorganization surfaced.
- [0061](0061-identity-resolves-on-demand.md) — the request store holds the
  request, identity resolves on first ask, and `App.Locals` is gone. This is
  0057's "middleware boots and populates `locals`" and "session resolved eagerly"
  rows: the middleware now only establishes the request scope, and a request
  that never asks who the user is pays nothing.
- [0062](0062-the-app-is-the-surface-not-a-shared-contract.md) — the application
  is the in-process surface, the fetch client is typed by the wire, and
  `AstromechClient`, `transport/local/` and the `astromech/local` subpath are
  gone.

## Rejected

- **Rewriting 0057 to match.** Records are append-only and evidence, not law.
  0057 explains why the shape was chosen with what was known then; this record
  explains what a stage of implementation learned. Editing 0057 would erase the
  distance between the two, which is the useful part.
- **A blanket supersession.** 0057's central decision — one instance, thin
  integrations, config at boot — is what shipped, so marking it superseded would
  overstate the change. The reversals are specific and named here;
  [0059](0059-the-worker-entry-is-a-cloudflare-integration.md)'s "supersedes 0053
  on placement" is the precedent for amending one part without retiring the whole.
