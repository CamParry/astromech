# Write-race and data-loss defects

Items 1 to 8 of a comparison with Matt Pocock's course-video-manager
(https://github.com/mattpocock/course-video-manager, commit `58b4c0e`), and the
two gaps in the former `entry-hook-contract-gaps.md`, confirmed open on main at
`b1f44c81`. Decided on 2026-10-02. Paths are under `packages/astromech/src/`
unless they start with a top-level folder.

## Why

A write decided by an earlier read has no condition on the write, so a change
made in between is overridden: scheduled publish overrides an editor who
unschedules, two creates leave two staged rows, two updates take the same
version number. On D1 `transaction()` runs the function with no transaction at
all (`database/transaction.ts`), so re-reading inside the transaction, the fix
item 8 proposed, would protect libsql only.

## Decided

- **Conditional writes, not an in-transaction re-read.** Each `UPDATE` carries
  its precondition in its `WHERE` (still scheduled, not trashed, staged change
  present or absent, not diverged on merge). Zero rows changed means the
  precondition failed, and the call answers 409. `content/write-guard.ts` builds
  the conditions. This works on D1 and keeps before-hooks outside any
  transaction, as `planned/hooks.md` places them. Rejected: item 8's re-read
  inside `writeBatch`, which D1 cannot honour.
- **Editor-to-editor conflicts are out of scope.** Two editors saving the same
  entry is `planned/editor-locking.md`.
- **The trash is read-only.** Update and publish on a trashed entry answer 409;
  restore is the only write. WordPress refuses to edit a trashed post until it
  is restored.
- **A scheduled publish whose row is no longer scheduled is skipped**, logged at
  debug level and not counted as a failure: the editor's later change wins.
- **Unique indexes are the backstop.** A partial unique index on `stagedFor`
  where it is not null, and a unique `(contentId, version)` index on all four
  versions tables. A violation answers 409, with no retry.
- **Restore migrates a copy of the backup, then swaps it in** (revised
  2026-10-03). Restore writes the backup to a temporary file and compares its
  migration names with the code's merged chain, as sets: plugin chains merge
  and run unordered, so there is no single head. A backup holding a migration
  the code lacks is refused, naming it; that covers a newer backup, a
  rebaselined chain and a removed plugin. Otherwise the chain runs forward on
  the temporary copy, then one transaction replaces the live tables with the
  copy's, keeping the preserved tables. Sessions and verification tokens are
  emptied rather than restored, so a revoked session stays revoked (Drupal's
  Backup and Migrate does the same). WordPress, Drupal, Rails, Django, D1 Time
  Travel and Turso all restore the whole database and migrate afterwards.
  Rejected: copying into the live schema and refusing any difference (the
  current `assertSameMigrations`, and Strapi), which makes every older backup
  unusable after one migration; restoring as taken and migrating on the next
  boot (WordPress, Drupal, Ghost), which leaves the live database behind the
  code and re-runs migrations over preserved plugin tables; restoring a newer
  backup with a warning (Rails, Django, Payload), since Kysely throws on a
  ledger row with no matching migration. D1 restores through Time Travel, which
  restores the whole database and returns an undo bookmark, and then writes
  the preserved rows back.
- **Every error a caller can reach is an `ApiError` subclass.** A bulk update
  setting `slug` answers 422 naming `slug`, before any write. Payload and
  Directus let the database refuse it and answer 400, but Astromech renames
  slugs to keep them unique (`same-1`), so the write would succeed with
  surprising results.
- **The OpenAPI document gains** the multipart `POST /media` and
  `POST /media/:id/replace`, `GET /entry-types` and `GET /entry-types/:type`,
  `POST /rpc/:id` once as the generic method call, and Better Auth's `/auth/*`
  merged from its `openAPI()` plugin's generated schema. `/setup`,
  `/setup/check` and the cron routes stay out as internal, as Strapi leaves out
  its admin API.
- **One branch, one commit per item**, each starting with a test that fails
  without the fix.

## The work

- [ ] **Scheduled publish.** `content/jobs/scheduled-publish.ts` (`publishOne`)
      writes on condition `status = 'scheduled'` and skips on zero rows. Globals
      too.
- [ ] **The write guard.** Add `content/write-guard.ts`. Update
      (`entries/internal/update-batch.ts`), staging create and merge
      (`entries/methods/staging/`), restore, and the last-admin check
      (`users/methods/update.ts`, `users/methods/delete.ts`) write on its
      conditions. Merge refuses a diverged staged change. A version snapshot
      reads the row the write changed, not the one loaded before the hooks ran.
      Change the order in `.claude/skills/code/SKILL.md` ("load and check"
      before "the writes, in one transaction") to match.
- [ ] **The trash is read-only**, tested for update, publish and status changes.
- [ ] **Unique indexes.** Add both, run `pnpm run db:generate`, and hand-apply
      the change to `apps/demo-cloudflare`'s migration and snapshot. Map the
      violation to 409 by index name, since SQLite's message names the index
      for an expression or partial index.
- [ ] **Backup restore.** Replace `assertSameMigrations` in
      `database/drivers/libsql.ts` with the set comparison, run the migrator
      on the temporary copy, then keep today's column-checked copy as the swap,
      and empty sessions and verification tokens. Check first whether the
      serving process ships migration files; if not, restoring an older backup
      runs through the CLI rather than the admin. Check each migration for
      reads outside the database (environment, config, files, clock), which a
      later forward run would not reproduce. Test a plugin removed without
      `plugin:purge` end to end. D1 restores through Time Travel.
- [ ] **Caller errors.** The bulk `slug` 422 in `update-batch.ts`; typed errors
      for `entries/methods/preview/issue-token.ts` and the `missing` (404) and
      `noStaged` (409) `AstromechError`s in
      `content/repository/content-table.ts`; `onError` unwraps any `ApiError`
      inside a `BulkOperationError` (`transport/http/middleware/errors.ts`).
      Grep `throw new Error` under `methods/` and `internal/` for the rest of
      the class.
- [ ] **OpenAPI coverage** as decided above.
- [ ] **Plugin versions.** Each `packages/plugins/*/src/index.ts` reads its
      version from its `package.json` with a JSON import, and a test checks the
      two agree.
- [ ] **CLI statuses.** Build the list from `statusSchema.options` in
      `transport/cli/commands/entries-create.ts`, `entries-update.ts` and
      `entries-status.ts`, and fix `apps/docs/cli.md`. Rename "Entry type slug"
      to "Entry type id" (`transport/cli/common-args.ts`) and "method-manifest
      entry" to "manifest method" (`transport/cli/commands/call.ts`).
