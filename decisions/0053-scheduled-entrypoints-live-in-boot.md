# 0053 — Scheduled entrypoints live in boot

**Date:** 2026-08-16
**Status:** superseded by 0059

`handleScheduled`/`runScheduledJobs` move from `cron/` to `boot/scheduled.ts` because a function that boots the runtime is an entrypoint, clearing the `capabilities-no-upward` lint errors; `cron/` keeps only the due-evaluator and registry. Rejected an allowlist exemption for the cron → boot edge.
