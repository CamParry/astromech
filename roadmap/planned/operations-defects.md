---
milestone: 1.0
---

# Operations defects

Found on 2026-10-04 while planning `roadmap/planned/site-health.md`,
`roadmap/planned/field-rename-command.md` and `roadmap/planned/admin-widgets.md`.
The first four were confirmed in the code; the rest are from reading it. Write
a failing test first.

- **Public reads serve undeclared keys.** `stripPrivateFields`
  (`packages/astromech/src/content/visibility.ts`) keeps a key with no
  definition, so a `private: true` field that is renamed or removed is served
  publicly until each row is saved again.
- **Cron schedules never update.** A job's schedule is written once at seeding
  (`onConflict: 'ignore'` in `packages/astromech/src/cron/repository.ts`) and
  never re-read, so changing `backups({ schedule })` has no effect on an
  existing site. `apps/docs/deployment/cloudflare.md` says an admin can change
  a schedule without a deploy; nothing can. Decided: the config is the source
  of truth and is synced on boot; the docs claim goes.
- **The cron secret is compared with `===`**
  (`packages/astromech/src/transport/http/routes/cron.ts`), which is not
  constant-time.
- **A failed cron run is recorded like a success**
  (`packages/astromech/src/cron/runner.ts`); `_astromech_cron` has no result or
  error column.
- **Pending migrations are not checked on Workers**, which have no file system
  (`packages/astromech/src/database/migrations.ts`); the list of migration
  names needs bundling at build time.
- **`validate` mixes staged and live rows** under one id and locale, and never
  checks staged globals
  (`packages/astromech/src/transport/cli/validate-stored-content.ts`).
- **Undeclared nested keys survive a save** while root keys are dropped
  (`projectToSchema` in `packages/astromech/src/fields/values.ts`).
  `roadmap/planned/field-rename-command.md` decides saves keep both.
- **`--allow-remote` guards nothing on D1**: the D1 driver always reports itself
  remote (`packages/astromech/src/database/drivers/d1.ts`), and
  `apps/docs/deployment/cloudflare.md` never says how the CLI reaches
  production D1.
- **The dashboard counts entry types the user cannot read**
  (`packages/admin/src/pages/_protected/index.tsx`), showing 0 instead of
  hiding the card, with two requests per type. The sidebar's copy is in
  `roadmap/planned/permissions.md`.
- **The database driver is named by `type`** where the storage, image, email
  and scheduler drivers use `name` (`packages/astromech/src/types/config.ts`).

## The work

- [x] Public reads drop undeclared keys.
- [x] Sync cron schedules from config on boot; fix the Cloudflare docs.
- [x] Constant-time comparison of the cron secret.
- [x] A result and error on each cron run.
- [x] Bundle migration names so Workers can check them.
- [x] `validate` reads staged rows apart, globals included.
- [x] A remote guard that means something on D1, and docs for reaching
      production D1 from the CLI.
- [x] The dashboard checks read permission and makes one request.
- [ ] `name` on the database driver.
