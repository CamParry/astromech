---
name: testing
description: Test conventions for Astromech. Use when writing, editing, or reviewing any test under packages/*/tests.
user-invocable: false
---

Where a test file goes, and which files need per-file isolation, is in
`packages/astromech/AGENTS.md` and `packages/plugins/AGENTS.md`. This skill
covers how a test is written.

## Names

- **A test name states the behaviour in the present tense.** `it('rejects an
unknown id')`, `it('answers 405 for POST')`. Not `it('should reject …')`, and
  not a numbered list.
- **A file's header comment says what the file tests today.** No phase or slice
  numbers, no account of the refactor that produced it.

## The database

- **Tests run against a real database.** `createTestDb()` from `@tests/harness`
  builds a file-backed libsql database and applies the committed migration chain
  from `apps/demo/migrations`, so SQL, foreign keys and transactions are real.
  Call it in `beforeEach` so each test starts empty. Do not mock a repository to
  avoid the database.
- **`setupTestConfig(makeTestConfig())` gives the representative config.** Its
  entry types (`post`, `note`, `snippet`, `card`) and two locales cover most
  capability combinations; adjust a copy of it in the test rather than building
  a config from scratch.
- **Shared fixtures come from `_support/`**, not a local copy.
  `@tests/fixtures` holds `noopStorage`, `adminRole` and `roleWith`; add a
  fixture there once a second file needs it.

## Mocks

- **Mock the leaf module, not a barrel**, and only at a real boundary: the
  session, the AI SDK, the network. `vi.mock('@/users/session')` is the model.
- **A mock of a module other files import, `vi.resetModules()`, a stubbed
  global, or a write to `globalThis.__astromech` makes the file isolated.** The list and the test that
  guards it are described in `packages/astromech/AGENTS.md`.

## Time

- **Never sleep.** A wall-clock `setTimeout` makes a test slow at best and flaky
  under load at worst.
- **Waiting for the UI:** `await screen.findBy…` or `await waitFor(() =>
expect(…))`. To assert that something does not happen, wait for a positive
  signal that the work has settled first, then assert the negative.
- **Separating timestamps:** `vi.useFakeTimers({ toFake: ['Date'] })` and
  `vi.setSystemTime(…)`. Fake only `Date`, so database IO and promises still run,
  and restore real timers afterwards.

## React

- **Render with `@testing-library/react`** (`render`, `screen`, `userEvent`).
  Some older files render through a hand-rolled `createRoot`; move a file to
  Testing Library when you next change it rather than adding another.
- **Query by role or label**, as a user finds the element, before reaching for a
  test id.

## Assertions

- **A test must be able to fail.** An assertion that only checks nothing threw,
  or that the harness created a table, passes whatever the code does. Assert the
  value, the rendered output, or the stored row.
- **A route change is tested through the real router.** A service test calls the
  Local API and never touches `transport/http/routes/`, so it cannot catch a
  route that drops a field.

## Coverage

- **Thresholds live per directory** in `packages/astromech/vitest.config.ts`,
  one entry for each top-level directory of `packages/astromech/src`.
  `pnpm run test:run`, and so `verify`, fails when a directory drops below its
  entry. `pnpm -F astromech test:coverage` runs core's suite alone with coverage.
- **A change that raises a directory's coverage raises its threshold in the same
  commit.**
- **Never lower a threshold to pass.** Write the test instead.
