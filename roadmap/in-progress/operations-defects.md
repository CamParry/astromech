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
  (`packages/astromech/src/content/validate-stored-content.ts`).
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
- [x] `name` on the database driver.
- [x] The CLI disposes the wrangler platform proxy when any command finishes
      or fails, so `db:init` against a D1 binding exits; `mcp` disposes it on
      shutdown.
- [x] A Worker woken only by a Cron Trigger checks for pending migrations:
      done 2026-10-13 by having boot read the bundled names from a build-time
      define, `__ASTROMECH_MIGRATION_NAMES__`, where only the middleware
      registered them before.

## Checks on Cloudflare

Merged on 2026-10-04 and run on local workerd (`check:boot:cloudflare`, which
ticks against the new cron columns); these need a deployed Worker or
production D1.

- [x] A deployed Worker whose database lacks a migration logs the pending
      warning on its first request (bundled migration names). Checked
      2026-10-11: a testing build bundling an extra name, `9999_check_pending`,
      logged "1 migration has not been applied to this database:
      9999_check_pending" on the first request in each new isolate
      (`scripts/check-deployed-cloudflare.mjs` says how).
- [x] `d1().isRemote()` answers true for a binding marked `"remote": true` and
      under `CLOUDFLARE_ENV=production`, and `db:init --allow-remote` reaches
      production D1 after `wrangler login`. Checked 2026-10-11 with the
      `testing` environment: `isRemote()` answers false for the local binding
      and true under `CLOUDFLARE_ENV=testing`, `db:init` refuses that database
      without `--allow-remote`, and with it migrated the remote D1 (its
      `kysely_migration` row is from `deploy:testing` at 15:00:24 UTC).
- [x] The cron secret comparison (`timingSafeEqual` from `hono/utils/buffer`)
      runs on workerd without `nodejs_compat`. Checked 2026-10-11 on local
      workerd, in a Worker with no compatibility flags: it answers true for
      equal values and false for unequal ones, though the demo itself cannot
      be deployed without the flag (see "Left open").
- [x] The `last_result` and `last_error` cron columns and `POST /entries/count`
      on production D1. Checked 2026-10-11: the Cron Trigger records
      `last_result` `'ok'` and `last_error` null for `scheduled-publish`, and a
      signed-in `POST /cms/api/entries/count` answers 200 with `{ page: 0 }`.

## Left open

- **Restore cannot run on Workers**: `d1()` implements neither `dump` nor
  `restore`, by design
  ([database.md](../../apps/docs/configuration/database.md#backups-are-not-available-on-d1)),
  so the backups plugin answers 400 before any migration code runs. The work
  is "D1 dump/restore" in [backlog.md](../backlog.md). A D1 restore would then
  meet the next wall: `createMergedProvider` loads the app migrations' code
  from disk, which bundled names do not replace.
- **No screen shows a cron run's result**: `last_result` and `last_error` are
  stored and documented, and nothing in the admin or the API reads them yet
  (`roadmap/planned/site-health.md`).
- **Undeclared nested keys survive a save** (`projectToSchema`), left to
  `roadmap/planned/field-rename-command.md` as the defect list says.
- **Wrangler prints an error on a remote D1 run that succeeds**: `db:init`
  with `--allow-remote` printed "Network connection lost." three times, and
  the testing build once, each marked `[ERROR]`, then exited 0 with the
  migrations applied. It comes from wrangler's remote proxy; the cause was not
  found, and it reads as a failure. Recorded in `backlog.md`, Tooling.
