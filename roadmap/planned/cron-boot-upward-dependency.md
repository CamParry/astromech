# Cron reaches up into boot

`pnpm run lint:deps` fails on `main` with two `capabilities-no-upward` errors:

```
error capabilities-no-upward: src/cron/runner.ts → src/boot/ensure-booted.ts
error capabilities-no-upward: src/cron/index.ts → src/boot/ensure-booted.ts
```

Both imports arrived with `roadmap/completed/workers-cron-never-boots.md` (the
scheduled path has to boot the runtime before it can run jobs), so the fix that
closed that defect opened this layering violation, and the gate has been red on
`lint:deps` since. Found 2026-08-16 while verifying an unrelated branch.

The question is design, not mechanics: either the scheduled entrypoint that
calls `ensureBooted` belongs to `boot/` (with cron exposing only the job-running
function), or the rule needs a recorded exception. Silence via allowlist without
a decision is the one wrong answer — `decisions/` should say why whichever way
it goes.

Related, same review: `entries/storage/table.ts` still **silently skips**
unknown sort columns for table-backed entry types, while built-in storage now
throws `UnknownSortKeyError`. The two storages disagree about a typo'd sort key;
whichever module ends up owning sort validation should reconcile them on the
reasoning of `decisions/0029-an-unknown-where-key-throws.md`.
