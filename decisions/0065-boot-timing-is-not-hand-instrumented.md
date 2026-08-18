# 0065 — Boot timing is not hand-instrumented

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0064 (the boot-timing sub-point only)

0064 inlined the boot sequence into `createAstromech`'s `build` and had it wrap
each step in a `utilities/timing.ts` `stopwatch()`, logging a
`[astromech] ready in Nms (resolve config Xms, …)` line to stderr on every boot.
That instrumentation is removed. `build` now lists its steps with nothing
measuring them, and `utilities/timing.ts` is deleted.

## Why remove it

Boot happens once per process and the steps are sub-100ms. Knowing that "resolve
config took 4ms" on every run has almost no standing value — it is
investigation-time data, and investigation-time data belongs in a profiler, not
baked into the hot path.

When a boot is actually slow, a profiler is the better tool on every axis. `node
--cpu-prof`, `node --inspect`, or `clinic flame` give a flamegraph of every
function in the boot, not the six labels `build` happened to pick, with zero code
to maintain and no enable/disable flag to reason about. The hand-rolled stopwatch
was strictly worse than the thing you would reach for anyway.

## What replaces it

- **Diagnosing a slow boot:** attach a profiler to the process.
- **Cold-start times in production:** the platform reports them (Cloudflare
  Workers analytics), and a metrics tool like Sentry captures the rest. A
  console line in the runtime is not how that signal is collected.
- **If a single cold-start number is ever wanted in-process:** add one
  start-to-finish measure, not per-step instrumentation.

## Rejected

- **Keep the per-step stopwatch, make it disableable.** Even gated behind an env
  var it clutters `build`, and the payoff is a worse version of a profiler.
- **A global ambient timing framework** every layer records into. No second
  consumer exists. The per-request performance panel that would be that consumer
  is a separate, larger feature —
  `roadmap/planned/request-performance-monitoring.md` — and building the
  framework before it is speculation.
