# 0053 — Scheduled entrypoints live in boot

**Date:** 2026-08-16
**Status:** accepted

`handleScheduled` and the deprecated `runScheduledJobs` are in
`packages/astromech/src/boot/scheduled.ts`. `cron/` keeps the due-evaluator
(`onTick`, `runDue`) and the registry, and imports nothing from `boot/`.

They were in `cron/index.ts` and `cron/runner.ts`, and `pnpm run lint:deps`
failed on `main`:

```
error capabilities-no-upward: src/cron/runner.ts → src/boot/ensure-booted.ts
error capabilities-no-upward: src/cron/index.ts → src/boot/ensure-booted.ts
```

Both edges arrived with `roadmap/completed/workers-cron-never-boots.md`. A
Cloudflare Cron Trigger fires `scheduled()`, never `fetch()`, so the injected
middleware has not run and the scheduled path has to boot the runtime before it
can tick. The fix that closed that defect called `ensureBooted()` from `cron/`,
which is an upward edge, and the gate has been red on `lint:deps` since.
`runScheduledJobs` imported it dynamically to dodge a module cycle, which was a
second signal that the function was in the wrong file rather than a reason to
keep it there.

## A function that boots the runtime is an entrypoint

The layer a module belongs to is decided by what it does, not by the subject it
talks about. `handleScheduled` is the host's `scheduled()` handler: it composes
boot with a tick, exactly as the injected middleware composes boot with a
request. That is composition-root work, and `boot/` is the composition root —
the LAYERS table in `packages/astromech/.dependency-cruiser.cjs` already lets it
import any layer below. Moving the two functions there removed both errors with
no runtime change and let `runScheduledJobs` take a static import, because
nothing under `boot/` imports `boot/scheduled.ts`.

What is left in `cron/` is the part that is genuinely about cron: seeding the
table, finding due jobs, claiming the lock, running handlers. It is callable by
any layer above it and calls nothing above itself.

## Rejected: an allowlist exemption for cron → boot

`capabilities-no-upward` can be silenced with a recorded exception, and the
roadmap item left that open. It was rejected because the rule's premise held
here. The premise is that an upward edge means one of two things: a misplaced
module, or a missing port. This was the first — two entrypoints filed under the
capability they happened to call. An exemption would have kept the modules where
they did not belong and spent the rule's credibility to do it, and the next
reader of `cron/` would still have found a capability that boots the runtime.
