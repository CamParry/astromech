# Derive from one source

> **Follows `roadmap/planned/drafts.md`** (decided 2026-10-03): staged changes become drafts in their own table, so revise the staging parts of this file before building it.

From a comparison with Matt Pocock's course-video-manager
(https://github.com/mattpocock/course-video-manager, commit `58b4c0e`) on
2026-10-01, split out on 2026-10-02. Paths are under `packages/astromech/src/`
unless they start with a top-level folder; line numbers were taken on
2026-10-01 and may have drifted.

Each item removes a hand-kept copy that can drift from the thing it copies.

## Decided (2026-10-02)

- **Planned as written.** Methods declaring their errors lands after the caller
  errors in `planned/write-race-and-data-loss-defects.md`, since it builds on
  those `ApiError` classes.

## The work

- [ ] **Classify every column a copy touches.** Copies list columns by hand
      in six places (version snapshot, version restore, staging create, merge,
      `entries/methods/duplicate.ts:98`, new locale). Add one
      `satisfies Record<keyof typeof entryContentTable.columns, 'copied' | 'reset' | 'derived'>`
      per resource in `content/` and have each copy read it, so a new column
      fails the typecheck until it is classified. Add a test that each versions
      table's columns equal `versionedColumns` plus its own keys.
- [x] **One source for entry status.** It is written seven times:
      `entries/schema.ts:7`, `types/domain.ts:46`, `entries/tables.ts:46`,
      `globals/tables.ts:32`, and in the admin at
      `packages/admin/src/hooks/use-list-controller.ts:17`,
      `packages/admin/src/rendering/cells/status-variant.ts:4` and
      `packages/admin/src/pages/_protected/index.tsx:26` (a copy of
      `statusVariant`). Add `ENTRY_STATUSES` and derive the rest. Backups
      restates its status and trigger the same way
      (`packages/plugins/backups/src/tables/runs.ts:14`). Done 2026-10-03:
      `ENTRY_STATUSES` in `types/domain.ts`, exported from `astromech/shared`,
      and `BACKUP_RUN_STATUSES` and `BACKUP_RUN_TRIGGERS` in backups.
- [ ] **Methods declare the errors they raise.** HTTP refusals are
      hand-written strings (`transport/http/routes/http-routes.ts:53`). Add an
      `errors` key to `defineServiceMethod` and derive the refusals and OpenAPI
      statuses from it. A lint rule can then ban `throw new Error` under
      `methods/` and `internal/`.
- [ ] **Cancellation follows the platform.** Add `signal?: AbortSignal` to
      the `astromech/fetch` client (`transport/http/client.ts:102`) and pass it
      from the admin's query functions.
- [ ] **Smaller derivations.** Type `AstromechApiError` from
      `errorBodySchema` (`transport/http/client.ts:28-34`), use `SortDirection`
      for the eight `'asc' | 'desc'` copies, and document the defaults of
      `EntryType.versioning` and `translatable` (`types/config.ts:187,194`).
- [ ] **Shared boundary doubles.** Stages 2b and 4 of
      [test-suite-review](../completed/test-suite-review.md) shipped the real
      filesystem driver and a `StorageDriver` contract test. Left: a shared
      `recordingEmail()` double in `tests/_support` for the per-file email
      drivers (one exists locally in `packages/plugins/forms/tests`), and
      replacing the mocks of Astromech's own modules in
      `tests/transport/tools/scoped-tools.test.ts`,
      `packages/plugins/assistant/tests/service/sessions.test.ts` and
      `tests/transport/cli/commands.test.ts`.
