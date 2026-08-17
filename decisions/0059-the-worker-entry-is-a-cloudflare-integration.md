# 0059 — The Worker entry is a Cloudflare integration

**Date:** 2026-08-17
**Status:** accepted

Supersedes `decisions/0053-scheduled-entrypoints-live-in-boot.md` on placement.

`createWorkerEntry` lives in
`packages/astromech/src/integrations/cloudflare/index.ts` and publishes from
`astromech/cloudflare`. It returns `{ fetch, scheduled }`: `fetch` is the Astro
adapter's handler, passed through unchanged, and `scheduled` creates the
application and ticks. `src/boot/scheduled.ts` and its `handleScheduled` are
deleted.

## Context

0053 moved `handleScheduled` out of `cron/` and into `boot/`, because a function
that boots the runtime is an entrypoint and `cron/` is a capability that must
not import upward. That reasoning holds and is kept.

What 0053 could not say is which entrypoint directory, because there was only
one candidate. `boot/` was both the composition root and the only home for
anything host-facing. `roadmap/in-progress/application-instance-and-integrations.md`
added `integrations/`, one directory per host runtime, each doing four moves:
capture the input in the host's native form, get the app, hand it over, emit the
result. The scheduled handler is exactly those four moves for a Cron Trigger, so
it belongs beside the Astro middleware that does them for a request, not beside
the phases both of them call.

Placement was not the only cost. The old shape asked the site author to write
the `scheduled()` wrapper by hand and left `fetch` somewhere else, so a Worker
had two entry files and one of them was boilerplate. One factory returning both
handlers removes that.

## Decision

The composition root stays `boot/`: `createAstromech`, the phases, migrations.
An entrypoint that adapts a specific host to it lives under `integrations/<host>/`.
`boot/` holds no host-facing handler.

`createWorkerEntry` also nominates the default scheduler, calling
`setDefaultScheduler(cloudflareCron)` on a slot in `cron/registry.ts`. That
replaces `defaultScheduler()` in `boot/lifecycle.ts`, which chose the driver by
reading `navigator.userAgent`. The integration knows its platform by existing,
so the runtime does not have to guess. `isWorkersRuntime()` in
`cloudflare/bindings.ts` is untouched: binding resolution is the one place no
config and no integration can answer, because the CLI resolves bindings in plain
Node through wrangler.

The behaviour change is intended: a Cloudflare deployment that does not use
`createWorkerEntry` now registers `interval()`, so the Worker would own a timer
it cannot usefully run. `apps/docs/configuration/scheduler.md` documents the
entry, and a config naming `cloudflareCron()` still wins over the default.
Nothing is released, so no compatibility path is owed.

## Rejected

- **Keeping `handleScheduled` in `boot/` and adding `createWorkerEntry` beside
  it.** Two names for one path, with the second delegating to the first, so a
  reader has to learn which is the front door. The wrapper is the front door.
- **Sniffing the runtime inside `integrations/cloudflare/`.** It moves the
  guess rather than removing it, and it still misreports for a Node process
  serving a Cloudflare-hosted site through a proxy.
- **A `platform` key in `AstromechConfig`.** A second place to declare what the
  entry file already declares by being imported, and one that can disagree with
  it.
