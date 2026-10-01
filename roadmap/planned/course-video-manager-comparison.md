# Course-video-manager comparison

Suggestions from comparing Astromech with Matt Pocock's course-video-manager
(https://github.com/mattpocock/course-video-manager, commit `58b4c0e`) and his
current published views (October 2026), done on 2026-10-01. Paths are under
`packages/astromech/src/` unless they start with a top-level folder.

Defects come first, then the patterns that would have prevented them, then docs
and agent tooling. Split a group into its own file when work on it starts.

Keep what is already as good as or better than course-video-manager: the
exhaustive-`switch` lint rule, version rows that are never updated, one error
map for five transports, the isolation list checked both ways,
`exactOptionalPropertyTypes`, return types on 419 of 428 exported functions,
decisions that land with their code, `check:docs`, and error messages that name
the fix.

## Needs a decision first

Three items reverse a recorded decision. Settle each in `DECISIONS.md` before
starting it:

- Item 12 (`no-unsafe-*` rules) touches "type-checked presets" at
  `DECISIONS.md:231`.
- Item 13 (import-cycle test) touches "Nothing enforces the layer model" at
  `DECISIONS.md:109`. Its premise, "no real cycle", no longer holds.
- A scheduled read-only architecture review (Matt runs
  `/improve-codebase-architecture` every few days) may fall under "periodic
  clean-up passes" at `DECISIONS.md:235`.

Item 8 also conflicts with `hooks.md`, which places before-hooks after
load-and-check and outside any transaction. Decide the order there first.

## Defects to confirm with a test first

- [ ] **1. Scheduled publish ignores later changes.** The job reads due rows,
      then publishes each with no "still scheduled" condition
      (`content/jobs/scheduled-publish.ts:18-38`). An editor who unschedules or
      unpublishes in that window is overridden. Globals too. Make the write
      conditional on `status = 'scheduled'` and treat zero rows changed as a
      skip. The class: a write decided by an earlier read with no condition on
      the write.
- [ ] **2. "One staged change" and version numbers aren't enforced by the
      database.** `idx_entry_content_staged_for` is not unique
      (`entries/tables.ts:65`, `globals/tables.ts:50`), so two concurrent
      creates leave two staged rows and `findStaged` reads either one. Version
      numbers are max+1 (`content/versions.ts:91`) with no unique index on
      `(contentId, version)` in any of the four versions tables. D1 has no
      transactions to stop either race. Add the unique indexes, run
      `db:generate`, and hand-apply the change to the Cloudflare baseline.
- [ ] **3. The CLI advertises a `draft` status the schema refuses.**
      `transport/cli/commands/entries-create.ts:17`, `entries-update.ts:15` and
      `entries-status.ts:48` say `draft`; `entries/schema.ts:7` accepts
      `unpublished`. The cast at `entries-create.ts:31` hides it, so
      `--status draft` gets a 422. `apps/docs/cli.md:52,62` repeats it. Build
      the list from `statusSchema.options`. In the same pass, rename "Entry
      type slug" to "Entry type id" (`transport/cli/common-args.ts:32`) and
      "method-manifest entry" to "manifest method" (`transport/cli/commands/call.ts:16`).
- [ ] **4. Plugin versions are hard-coded.** All six `packages/plugins/*/src/index.ts`
      set `version: '0.1.0'` apart from `package.json`. The first Changesets
      bump makes them wrong, and the `dependsOn` check reads them
      (`plugins/runtime/plugin-identity.ts:191`). Read the version from
      `package.json`.
- [ ] **5. Checks run outside the write's transaction.** Update reads the row
      (`entries/internal/update-batch.ts:77-83`), runs hooks, then opens the
      transaction (`:129`) and snapshots the stale row as the version (`:210`).
      Staging merge (`entries/methods/staging/merge.ts:38-55`), staging create
      (`entries/methods/staging/create.ts:35`) and the last-admin check
      (`users/methods/update.ts:46`, `users/methods/delete.ts:24`) have the
      same gap. Merge also never refuses a diverged staged change. Trashed
      entries can be updated and published (`update-batch.ts:82`,
      `includeTrashed: true`); decide whether trash is read-only and test it
      either way. Fixed by item 8.
- [ ] **6. Caller mistakes answer 500.** `update-batch.ts:67` throws a bare
      `Error` for a bulk slug update; `entries/methods/preview/issue-token.ts:34`
      and `content/repository/content-table.ts:570-577` throw untyped errors a
      race can reach. Make each an `ApiError` subclass. `onError` unwraps
      `BulkOperationError` only for a `ValidationError` cause
      (`transport/http/middleware/errors.ts:190`); unwrap any `ApiError`.
- [ ] **7. Backup restore copies columns by position.**
      `database/drivers/libsql.ts:170-172` runs `INSERT ... SELECT *`, so a
      backup taken before a migration that reordered a table restores values
      into the wrong columns. Build an explicit column list from both
      databases, or refuse a backup from a different migration head.

## Patterns to adopt

- [ ] **8. One write guard, inside the transaction.** Add
      `content/write-guard.ts` to own the lifecycle rules: trashed, staged
      change exists or missing, diverged on merge. Each write re-reads its row
      inside `writeBatch` (or merge, restore, staging create) and calls it. New
      tables that hang off an entry inherit it. The `code` skill currently
      orders "load and check" before "the writes, in one transaction"
      (`.claude/skills/code/SKILL.md:55-61`); change that order.
- [ ] **9. Classify every column a copy touches.** Copies list columns by hand
      in six places (version snapshot, version restore, staging create, merge,
      `entries/methods/duplicate.ts:98`, new locale). Add one
      `satisfies Record<keyof typeof entryContentTable.columns, 'copied' | 'reset' | 'derived'>`
      per resource in `content/` and have each copy read it, so a new column
      fails the typecheck until it is classified. Add a test that each versions
      table's columns equal `versionedColumns` plus its own keys.
- [ ] **10. One source for entry status.** It is written seven times:
      `entries/schema.ts:7`, `types/domain.ts:46`, `entries/tables.ts:46`,
      `globals/tables.ts:32`, and in the admin at
      `packages/admin/src/hooks/use-list-controller.ts:17`,
      `packages/admin/src/rendering/cells/status-variant.ts:4` and
      `packages/admin/src/pages/_protected/index.tsx:26` (a copy of
      `statusVariant`). Add `ENTRY_STATUSES` and derive the rest. Backups
      restates its status and trigger the same way
      (`packages/plugins/backups/src/tables/runs.ts:14`).
- [ ] **11. Migrate the test database once.** `createTestDb()` runs the full
      migration chain for each of about 150 call sites
      (`tests/_support/harness.ts:118`). Measured: 330-506 ms to migrate one
      database against 3-4 ms to copy a migrated file. Migrate a template in
      `tests/_support/global-setup.ts` and copy it. Record the timings and the
      rejected options in `DECISIONS.md`. Overlaps `test-suite-review.md`.
- [ ] **12. Turn on the `no-unsafe-*` rules.** A trial run of the five rules
      finds 26 hits, all untyped data flows, e.g. `params: any` in
      `entries/internal/preview.ts:29` and an `any` stream chunk in
      `media/serving/handler.ts:31`. Add `@types/nodemailer` to remove the
      `@ts-ignore` in `email/drivers/smtp.ts:29`. Needs a decision first.
- [ ] **13. Check for import cycles.** Two exist: a five-file loop through
      `policies/scoped-services.ts`, `plugins/runtime/plugin-runtime.ts`,
      `plugins/runtime/plugin-services.ts`, `app-context/services.ts` and
      `app-context/app-context.ts`; and `database/registry.ts` with
      `database/transaction.ts`. Add a test like
      `tests/exports/shared-browser.test.ts` that names these two and fails on
      a new one. Correct the layer list in `ARCHITECTURE.md` (transport and
      policies import the composition root). Needs a decision first.
- [ ] **14. Close the lint gaps in rules the docs say are enforced.** The
      ambient-read rule (`eslint.config.js:84-97`) matches `@/` specifiers
      only, so a relative import passes, and `.astro` files are not linted
      (`media/serving/image/Image.astro:12`). The admin's
      `no-restricted-imports` (`eslint.config.js:208-224`) misses a value
      import from the bare `astromech` root; add it with `allowTypeImports`.
- [ ] **15. Check the published types.** After `build`, fail if a bare import
      in `dist/**/*.d.ts` is not a dependency or peer dependency, and run
      `attw --pack`. `check:exports` checks key parity only, and
      `check:install` skips lib checks. Add `erasableSyntaxOnly` and
      `noImplicitOverride` to `packages/astromech/tsconfig.json` and
      `packages/schema-engine/tsconfig.json`; a trial run needs two `override`
      fixes.
- [ ] **16. Methods declare the errors they raise.** HTTP refusals are
      hand-written strings (`transport/http/routes/http-routes.ts:53`). Add an
      `errors` key to `defineServiceMethod` and derive the refusals and OpenAPI
      statuses from it. A lint rule can then ban `throw new Error` under
      `methods/` and `internal/`.
- [ ] **17. Shared boundary doubles.** Add `memoryStorage()` and
      `recordingEmail()` to `tests/_support/fixtures.ts` and replace the 12
      inline storage drivers and the per-file email drivers. Then remove mocks
      of Astromech's own modules, worst first:
      `tests/transport/tools/scoped-tools.test.ts:15-18`,
      `packages/plugins/assistant/tests/service/sessions.test.ts:28`,
      `tests/transport/cli/commands.test.ts:29-41`. Overlaps
      `test-suite-review.md`.
- [ ] **18. Cancellation follows the platform.** Add `signal?: AbortSignal` to
      the `astromech/fetch` client (`transport/http/client.ts:102`) and pass it
      from the admin's query functions.
- [ ] **19. Smaller derivations.** Type `AstromechApiError` from
      `errorBodySchema` (`transport/http/client.ts:28-34`), use `SortDirection`
      for the eight `'asc' | 'desc'` copies, and document the defaults of
      `EntryType.versioning` and `translatable` (`types/config.ts:187,194`).

## Docs and agent tooling

- [ ] **20. Remove instructions that send agents the wrong way.**
      `.claude/commands/feature.md:23` creates worktrees under
      `.claude/worktrees/`, inside the repo, which `AGENTS.md` says breaks
      resolution; the same file names the parked `coder` and `tester` agents.
      `AGENTS.md:88`, `packages/admin/AGENTS.md:3`, `apps/docs/AGENTS.md:3` and
      `roadmap/README.md:26` point at the parked `docs`, `ui`, `css` and
      `testing` skills. `.claude/skills/code/SKILL.md:165-171,205` has rules the
      code contradicts (named exports only, no `style={{}}`, `@/` imports only,
      three commit types), and the `api` skill still describes `safeParse`
      routes. `.claude/settings.local.json` repeats both project hooks.
- [ ] **21. Turn repeated-mistake memories into hooks and checks.** Give
      `scripts/check-boot.mjs` and `scripts/check-boot-cloudflare.mjs` a
      throwaway `BETTER_AUTH_SECRET` and an unset `NODE_ENV`, as
      `scripts/check-install.mjs:122` does. Make
      `.claude/hooks/block-destructive-git.sh` ask on `stash`, `--no-verify`
      and `npm install`. Deny `isolation: "worktree"` on the Agent tool. Add a
      drift test over `apps/demo-cloudflare/migrations/snapshot.json`. Retire
      the matching memory notes.
- [ ] **22. Cite decisions by title, and check the citation.** 22 code comments
      cite a bare `(DECISIONS.md)`, e.g. `entries/internal/update-batch.ts:149`.
      Cite the entry's title, and have `scripts/check-docs-links.mjs` confirm
      it matches a bold lead. Fix the stale `why` at
      `scripts/report-drift.mjs:66`.
- [ ] **23. Tighten `TERMINOLOGY.md`.** Give the seven bare rejections a reason
      (Entry, Global, Repository, Resource, Resource type, Driver, Admin
      resource). Add the missing two-way guards: Confirmation and Approval,
      Integration and Adapter, Request scope and App context, Admin resource
      and Resource. Move code names out of Resource, Resource type, Schema and
      Version. Add Status, Draft, Hook and Role.
- [ ] **24. A roadmap file skeleton.** Why; Decided; work items each with
      `Blocked by:` and `Done when:`; Testing (what is tested at which seam,
      what deliberately isn't, and why); Out of scope. Dependencies are prose
      today (`hooks.md:93`).
- [ ] **25. Merge bodies that carry evidence.** Merge branches with `--no-ff`
      so the Drift line `AGENTS.md:53` asks for has a home: 4 merges among 204
      first-parent commits since 2026-09-20. Add Evidence (the test that fails
      without the change) and Door (one-way or two-way).
- [ ] **26. Refresh the Matt Pocock skills.** `grilling` is the old
      one-question-at-a-time version. `ubiquitous-language` was removed
      upstream but `.claude/commands/plan.md:28` still recommends it. Link
      `retro`, `diagnosing-bugs`, `pr` and `writing-for-agents`. Add a note to
      `AGENTS.md` mapping his `GLOSSARY.md`, ADRs and specs to
      `TERMINOLOGY.md`, `DECISIONS.md` and `roadmap/`, so `code-review` finds
      them.
- [ ] **27. Log the demo dev server to a file.** Tee `apps/demo/package.json`'s
      `dev` output to a file agents can read, since they may not restart your
      server, and say so in `apps/demo/AGENTS.md`.
