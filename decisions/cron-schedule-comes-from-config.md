---
area: config
---

# A cron job's schedule comes from config

Each tick writes a registered job's `schedule` to its `_astromech_cron` row when the two differ; the row keeps `enabled`, the last run and the lock (`packages/astromech/src/cron/runner.ts`). A job no longer registered keeps its row, which the runner skips, so a re-added job resumes from its last run and two deploys running at once do not delete each other's rows.

**Rejected:** the stored row winning after first seeding (a changed `backups({ schedule })` does nothing); syncing only at boot (only a tick reads the schedule).
