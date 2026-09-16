---
name: testing
description: Test conventions for Astromech. Use when writing, editing, or reviewing any test under packages/*/tests.
user-invocable: false
---

Where a test file goes, and which files need per-file isolation, is in
`packages/astromech/AGENTS.md`, `packages/admin/AGENTS.md` and
`packages/plugins/AGENTS.md`. This skill covers how a test is written.

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
  session, the AI SDK, the network. `vi.mock('@/auth/session')` is the model.
- **A mock of a module other files import, `vi.resetModules()`, a stubbed
  global, or a write to `globalThis.__astromech` makes the file isolated.** Core
  and the admin each keep their own list, described in their `AGENTS.md`. One
  check, `packages/astromech/tests/_support/isolation-check.ts`, guards both:
  each package's `tests/isolation-list.test.ts` runs it over that package's
  tests.

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

- **Render with `@testing-library/react`** (`render`, `renderHook`, `screen`,
  `userEvent`).
- **Component tests live in the admin**, in `packages/admin/tests/`, and
  `packages/admin/tests/_support/dom-setup.ts` runs before every happy-dom file
  there. It turns on
  React's act environment, unmounts what each test rendered, and fails a test on
  any request it did not mock, naming the URL. Stub `fetch`, mock the client
  module, or seed the query cache the component reads.
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

- **Thresholds live per directory** in the `vitest.config.ts` of core and of the
  admin, one entry for each top-level directory of that package's `src`.
  `pnpm run test:run`, and so `verify`, fails when a directory drops below its
  entry. `pnpm -F astromech test:coverage` and
  `pnpm -F @astromech/admin test:coverage` run one suite alone with coverage.
- **A change that raises a directory's coverage raises its threshold in the same
  commit.**
- **Never lower a threshold to pass.** Write the test instead.
