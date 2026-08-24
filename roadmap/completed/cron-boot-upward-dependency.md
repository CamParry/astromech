# Cron reaches up into boot

Two defects found on 2026-08-16 while verifying an unrelated branch: a layering
violation that kept `lint:deps` red, and two entry storages disagreeing about a
typo'd sort key.

- [x] The scheduled entrypoints moved to
      `packages/astromech/src/boot/scheduled.ts`. `handleScheduled` and the
      deprecated `runScheduledJobs` boot the runtime before ticking, so they are
      entrypoints, not cron capability code. Both `capabilities-no-upward`
      errors (`src/cron/runner.ts` and `src/cron/index.ts` →
      `src/boot/ensure-booted.ts`) are gone and `lint:deps` reports 0 errors;
      `cron/` keeps the due-evaluator and the registry. The edges had arrived
      with `roadmap/completed/workers-cron-never-boots.md`, which needed the
      scheduled path to boot itself. An allowlist exemption was rejected —
      `DECISIONS.md`.
- [x] `packages/astromech/src/entries/storage/table.ts` throws
      `UnknownSortKeyError` on a sort key that is not a column, instead of
      skipping it. It had answered the default order for a typo while built-in
      storage threw, on the reasoning of
      `DECISIONS.md`. The error type is shared,
      so the HTTP route needed no change.
