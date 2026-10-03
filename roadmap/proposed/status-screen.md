# Status screen

Nothing tells an admin when the site is misconfigured. A broken scheduler never
publishes scheduled entries and nobody is told, which is WordPress's well-known
"missed schedule" failure. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **WordPress Site Health** (5.2), grown from the Health Check plugin.
- **Umbraco's Health Check**, including an SMTP test.
- **Kirby's system view**, which warns when content folders are exposed.
- **Craft's System Report.**

## Proposal

An admin page that shows:

- each cron job's last run and result;
- pending migrations;
- the drivers in use (database, storage, image, email, scheduler);
- missing or default environment variables;
- a test email and a storage write test, run on demand.

## Open questions

- Who can see it: admins only, or a permission?
- Does a failing check raise a notification
  (`roadmap/planned/notifications-channels-and-events.md`)?
- Can plugins add checks (the backups plugin's last run, for example)?
