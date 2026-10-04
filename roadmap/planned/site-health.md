---
milestone: 1.0
---

# Site health

Nothing tells an admin when the site is misconfigured. A broken scheduler never
publishes scheduled entries and nobody is told, which is WordPress's well-known
"missed schedule" failure. Raised on 2026-10-03 as a status screen; decided
2026-10-04.

Prerequisite: `roadmap/in-progress/operations-defects.md` (cron results, the
migrations list on Workers). Notifications use
`roadmap/planned/notifications-channels-and-events.md`.

## Prior art

- **WordPress Site Health** (5.2): tests registered through `site_status_tests`,
  direct and async, each `good`, `recommended` or `critical` with an action
  link, behind `view_site_health_checks`; a weekly scheduled check stores the
  counts.
- **Umbraco health checks:** extensible, with an SMTP test, turned off by key
  (`DisabledChecks`), and a scheduled notification with `FailureOnly`.
- **Craft's System Report** and utilities (`utility:system-report`),
  **Statamic** utilities, **Kirby's** system view.

## Decided (2026-10-04)

- **A registry of checks:** `defineHealthCheck({ key, label, mode, run })`.
  Plugins list theirs in `healthChecks: [...]`, namespaced
  `plugin:<ns>:<key>` as cron jobs are; the site adds checks and turns any off
  with `health: { checks, disabled: [key] }`.
- **Naming:** the page is "Site health" (WordPress) and an entry in it a
  "health check". Rejected: "status", which entries use for publishing, and
  "system report", Craft's information dump with no pass or fail.
- **Checks on page load,** each at most one cheap query:
    - a scheduler heartbeat: a job more than about 5 minutes past its next run is
      critical, the only way to catch a Worker with no Cron Trigger;
    - each job's last result;
    - pending migrations;
    - `BETTER_AUTH_SECRET` shorter than 32 characters or Better Auth's default
      (critical); `BETTER_AUTH_URL` unset in production (recommended); the cron
      secret missing while the webhook scheduler is in use (critical);
    - no email driver in production, so password reset cannot work;
    - HTTPS, and `trustProxy` when a forwarded header was seen;
    - database size against D1's limits (an optional `size()` on the driver;
      `page_count * page_size` on libSQL);
    - cron rows with no handler and removed plugins (pointing at `prune`).
- **`astromech doctor`** runs the load-time checks in the terminal
  (`roadmap/planned/cli-commands.md`).
- **Information, not checks:** the drivers in use, the runtime and the Node
  version.
- **On demand,** since they cost money or have side effects: a test email to
  the current user, a storage write, read and delete, an image transform, and
  "run cron now".
- **Result:** `{ status: 'good' | 'recommended' | 'critical', message, params?,
action?: { label, href } }`, the message a translation key. `run` returns
  `null` when the check does not apply on this runtime.
- **Permissions:** `health:read` to view, `health:run` for the on-demand tests;
  admins hold both.
- **A daily `health` cron job** runs the load-time checks and stores one row
  per check (key, status, params, when checked, when changed). Holders of
  `health:read` are notified only when a check turns critical. The planned
  "cron job failed" notification goes through the same row, so a job failing
  every minute notifies once.
- **Where:** `/health` in the sidebar's System section, with a badge counting
  critical checks. The Security screen (`roadmap/planned/core-security.md`)
  stays separate; security checks here link to it.

## The work

- [ ] `defineHealthCheck`, the registry, plugin `healthChecks`, the config
      to add and turn off checks.
- [ ] The load-time checks and the on-demand tests; `size()` on the drivers.
- [ ] The health table, with `pnpm run db:generate` and the Cloudflare
      baseline hand-applied; the daily job; notifications on a change to
      critical; "cron job failed" through it.
- [ ] `health:read` and `health:run`.
- [ ] The admin page, the sidebar badge, and the dashboard widget
      (`roadmap/planned/admin-widgets.md`).
- [ ] `apps/docs`: the checks, and writing one in a plugin.

## Testing

A job overdue by more than 5 minutes is critical; a short secret is critical; a
check that does not apply on Workers is absent there; a check turning critical
notifies once and staying critical notifies nothing more; `health:read` alone
cannot run the on-demand tests; a plugin check appears under its namespace and
a disabled key does not run.
