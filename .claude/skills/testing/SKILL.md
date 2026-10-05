---
name: testing
description: How Astromech's tests are written, run and reviewed. Use when writing, changing or reviewing a test, a helper under a package's tests/_support, or a vitest.config.ts.
user-invocable: false
paths:
    - 'packages/**/tests/**'
    - '**/*.test.{ts,tsx}'
    - '**/vitest.config.ts'
---

This skill says what a good test is here and how to run tests while you work. Where test files live and the module-isolation list are in each package's `AGENTS.md`; the gate commands are in the root `AGENTS.md`.

A test here has one job: fail when behaviour a caller depends on breaks, and stay green through any change that keeps that behaviour. The rest of this skill follows from that. When a case is not covered below, ask whether your test would fail if the behaviour broke, and only then.

## Two rules with no exceptions

- **Never change a test to get a pass.** Do not delete, loosen or skip an assertion, add `.skip`, `.only` or a retry, or lower a coverage threshold. If a test looks wrong, stop and say why. An assertion changes only when the task changes the behaviour it checks, and then your report names it. A test edited to agree with the code checks nothing, and it is the edit agents make most (in ImpossibleBench, a plain instruction like this one cut it from over 85% of runs to 1%).
- **Never replace the database with a mock.** A test that touches data runs on real SQLite through the harness. Foreign keys, unique indexes and transactions only behave as they do in a site on the real engine, and the harness makes a real database cheap.

## When this skill does not fit

If following it would make the code or the test worse, or would need a workaround, stop and raise it: say what you would change and why. Typical cases are a behaviour you can only test by mocking Astromech's own module, setup the harness cannot express, and an existing test that asserts the wrong thing. Workarounds written to satisfy a rule are how tangled code has entered this repo before.

## What to test

- **Test through the public surface**: a service method through `currentServices`, a hand-written route through the real router (`packages/astromech/tests/_support/mount-router.ts`), a component through what a user sees and does. A test there survives a refactor; a test of a private helper fails when the code moves but the behaviour has not. A helper that seems to need its own tests is probably a module of its own: propose that rather than exporting it for the test (`check:unused` fails on an export only tests use).
- **One test per behaviour, named for the outcome** in the present tense: `it('rejects a duplicate slug')`.
- **Write fewer, stronger tests.** Agents tend to write too many. Leave out what another check already proves: what `tsc` checks, a mapping with no branches, a route-table row that only forwards to a method (`packages/astromech/tests/transport/http/routes/rest-route.test.ts` covers the table, and the method's own test covers the method). Before adding a test, look for one of the same behaviour and add a case or an `it.each` row to it.
- **A rule that holds for every member of a set is tested once, over the set.** `packages/astromech/tests/content/resource-conformance.test.ts` runs its checks over every resource, as do the `resource-*.test.ts` tables beside it (versions, translation, field validation, definition, atomicity), and the parity tests (`packages/astromech/tests/transport/http/routes/rpc-parity.test.ts` and `packages/astromech/tests/transport/mcp/parity.test.ts`) over every manifest method. Add a case there rather than a copy per member. The plugins' equivalent is `packages/astromech/tests/_support/plugin-contract.ts`, which every plugin's `tests/contract.test.ts` calls.
- **A bug fix starts with a test that fails for the bug's reason.**
- **A defect you find but don't fix is recorded in a test, not skipped.** Write the test for the right behaviour as `it.fails`, with a comment saying what happens today, and add a `roadmap/planned/` file for the fix. Beside it, put a passing test that proves the setup reaches the step that goes wrong: inside `it.fails` any failure passes, so a broken setup would pass as the expected failure. When the defect is fixed the `it.fails` test fails, which is the signal to make it a plain `it`. Keep the pair together, the passing setup test first, so a reader sees both.
- **Use a property test where the input space is wide and the rule is short**: identifiers, escaping, parsers, schema diffs, slugs. They use fast-check, in a `*.property.test.ts` file beside the example tests (`packages/schema-engine/tests/diff.property.test.ts`, `packages/astromech/tests/entries/slug.property.test.ts`). Assert a round trip, an invariant or agreement with an independent oracle, never the code's own logic written again. Keep the example tests: a property says what always holds, an example shows what one input gives. When fast-check finds a counterexample, add it as an example case too.
- **Code that parses untrusted bytes gets crafted-input tests in its first commit**: anything that walks an upload, an import or a request body itself. Build an input sized to stress each loop and nested structure (thousands of entries, many items sharing or overlapping one block, a large decompressed size), and assert it finishes under a time limit that a naive implementation misses: well above the normal run, so a loaded machine does not trip it, and well below the slow one. A crafted file that ties up the CPU is a denial of service, and each one found in review costs a fix and another full gate: the image metadata parsers went through four review rounds, each finding a new slow file. A time limit proves nothing until you have seen it fail, and one written after a fix once passed on the slow code too, so run it against a deliberately slow version or before the fix. `packages/astromech/tests/media/internal/gps.test.ts` is the example (its tests named "quickly").
- **Every runtime test asserts something; a type-only test lives in a `*.test-d.ts` file.** Vitest fails a test that makes no `expect` call, and an `expectTypeOf` check does nothing at runtime. A `*.test-d.ts` file next to the runtime one (`packages/astromech/tests/database/plugin-tables.test-d.ts`) is compiled by the package's `typecheck` and never run by vitest, so its checks fail where they can.

## Writing a test with the code

Write one failing test, see it fail for the reason you expect, then write the code that makes it pass, one small step at a time. Take the expected values from the requirement, not from the implementation: a test copied from the code agrees with every defect in it. A test you never saw fail may pass whatever the code does, so if the code came first, break it briefly and watch the test catch it.

Before handing work back, check each new test once more: break the line it covers (or revert the fix), run it, see it fail, then restore the line. Reviewers keep finding tests that pass whatever the code does, such as an `it.fails` that passes on any error, and this check catches them first.

## Real dependencies, and the few you replace

Use the real version of everything Astromech owns: the database, config, services, repositories, router and plugin hooks. Replace only what leaves the process or cannot be controlled: outbound HTTP, email, the AI SDK and the clock. Prefer a fake passed through a seam the app already has over a `vi.mock`: the test config's drivers. `packages/astromech/tests/users/password-reset.test.ts` captures email with an `email` driver in its config, and `packages/astromech/tests/_support/fixtures.ts` has `noopStorage`. Storage is real where a test reads a file back: the harness's `createTestStorage()` is the filesystem driver in a temp dir, held to the same contract as R2 by `packages/astromech/tests/storage/drivers/contract.test.ts`, so don't write a storage fake. In the admin the server is the edge, so a test mocks the client module or seeds the query cache, not the admin's own hooks.

- **Identity comes from the harness, not a mock.** `runAsUser`, `contextAs` and `mountRouter` set the user and role, and `requestAs` sends a request to the whole HTTP app as a user and role, through the real request scope. `signInTestUser` (`packages/astromech/tests/_support/auth.ts`) gives a real Better Auth session when the session itself is under test.
- **A write that fails mid-transaction comes from the database**: `failWritesTo(table, operation)` in the harness adds a `RAISE(ABORT)` trigger on the real table (`packages/astromech/tests/content/resource-atomicity.test.ts`), so the failure lands inside the write's own transaction. A spy on one real method is fine only for a state the database cannot be put in, such as another worker holding a claim. Everything around it stays real.
- **Assert on the outcome, not on calls**: the returned value, the row read back through the service, the rendered text, the captured email. Count calls only when the call is the outcome, such as an email sent.
- **A mock costs more here than elsewhere.** A file that calls `vi.mock` or stubs a global loses the shared module graph and joins the isolated list, which is one more reason to prefer the options above.

## Setup and data

The house setup is `packages/astromech/tests/_support/harness.ts`; read its doc comments rather than guessing. `createTestDb()` in `beforeEach` gives each test its own database file, so no test sees another's rows and code that opens its own transaction runs as it does in a site. Each call copies a database migrated once per run, so a fresh database per test costs a few milliseconds. `setupTestConfig(makeTestConfig())` publishes a config whose entry types cover most capability combinations; change a copy of it for the test rather than writing a config from scratch.

- **Drivers come from the config, the way boot gets them.** `setupTestConfig` registers the config's storage, image, email and scheduler drivers through `registerDrivers`, the function boot calls. A test that needs a capturing or failing driver passes it in the config (`{ ...makeTestConfig(), storage }`) rather than calling a `set*` registry function; a set by hand outlives the test in a shared module graph. To make a driver fail mid-test, spy on the test's own fake.
- **Global state is reset in one place.** `createTestDb()` starts with `resetRuntime()`, which empties every registry the way boot finds them, so a test file never deletes a `globalThis.__astromech` slot itself. A test that needs no database but reads a registry calls `resetRuntime()` in its `beforeEach`. A file that wants a fresh registry and resets by hand will miss the next slot someone adds.
- **A plugin's tests register it for real** with `createPluginTestApp(key, config)` (`packages/astromech/tests/_support/plugin-app.ts`): its service typed by the plugin's own augmentation, `as(role, user)` for the scoped handle, the entries, globals, media and users services, its `ctx`, the admin config it serves, and `request(method, path)` over the real HTTP app. A structure test asserts through `adminConfig` rather than importing core's plugin runtime. One way in means a reader of one plugin's tests can read all of them, and no cast stands in for a type.

- **A CLI command is tested in process** through `packages/astromech/tests/_support/cli.ts`. `run(command, argv)` returns what the command printed and its exit code; `runOk` is for a setup step and throws on a non-zero exit or any stderr; `createTempSite` and `writeSiteConfig` lay out a site with a real config and libsql database that the CLI loads as it loads a site's.

- **Read a write back through the public read path**, not raw SQL, unless the point is that nothing was written.
- **Keep every value the assertion depends on visible in the test.** Helpers supply defaults. Some repetition is better than a reader searching `_support/` for the input.
- **Shared setup moves to `_support/` once a second file needs it**, and a helper there throws when it cannot build what it was asked for, as `createTestUser` does. A fixture that fails quietly hides broken tests.
- **Build typed values rather than casting.** A typed builder breaks when the type changes; `as unknown as User` hides the change, and the next agent copies it. Core's are `makeUser` and `field` in `packages/astromech/tests/_support/fixtures.ts`, and `createTestUser` (which returns the `User`) and `resolveTestConfig` in the harness. Input that breaks its type on purpose, to reach the runtime check behind it, goes through `invalid<T>()` from the same fixtures file, so the intent is named and searchable.

## How a test reads

- Hard-code the expected value. Recomputing it with the code under test makes the test agree with itself.
- Use the most specific matcher (`toEqual` on the shape, `rejects.toBeInstanceOf(ValidationError)`), so a failure says what was expected and what happened.
- Keep snapshots small and inline. A large stored snapshot gets updated without being read. `packages/astromech/tests/codegen/type-generator-golden.test.ts` is the exception, because its output is the product.
- In a component test, find elements as a user would, by role or label, and assert the English text a user reads. Render admin UI through `packages/admin/tests/_support/render-admin.tsx`, which supplies the app's providers, a router and a signed-in user. A plugin's admin page renders through `renderPluginPage` from the same file, in the plugin's own suite: `pluginVitestConfig({ adminPages: true })` runs its `tests/admin/*.test.tsx` with the admin's setup. Every field's label names its control or group, so find a field by its label (`getByLabelText`, or `getByRole` with `name`). `packages/admin/tests/_support/dom-setup.ts` fails any test that makes a request it did not mock.

## Order, time and flakes

- **Tests pass in any order and in parallel.** Every suite runs shuffled, and core and the admin share one module graph per worker, so state one file leaves behind reaches the next in a different file each run. Use unique values (`crypto.randomUUID()`) rather than shared fixed keys, and set what a test needs in its own `beforeEach`. A database shared across a file's tests (`createTestDb()` in `beforeAll`) is an order dependence waiting for a seed. Vitest prints the seed as a run starts; replay a failing order with `--sequence.seed=<n>`.
- **No real sleeps.** To wait for the UI or other async work, wait on a signal (`findByRole`, `waitFor`); to show that something does not happen, wait for a sign the work has settled first. To separate timestamps, fake only `Date` with `vi.useFakeTimers({ toFake: ['Date'] })`, so database IO and promises still run, and restore real timers afterwards.
- **A test fails on a `console.error` or `console.warn` it did not declare** (`packages/astromech/tests/_support/console-guard.ts`, set up for core, the plugins and the admin). Declare expected output with `expectConsole(level, pattern)` from `@tests/console`, which also fails the test when the output never comes; a spy that mocks the method still works when the test reads the calls. An unexpected message is a defect to fix at its cause, not noise to declare: declaring it hides the next real one behind the same pattern.
- **A flaky test is a defect.** Reproduce it before changing anything: run the file repeatedly, and in the order that failed. Rerunning until green hides it.

## Running tests

Run the cheapest check that can catch your mistake after every edit, and the expensive ones before the change lands.

- **After each edit**: the test files for what you touched, with `pnpm -F <package> exec vitest run <path>`. `pnpm -F <package> test:run <path>` also works, but not with a `--` before the path: pnpm passes the `--` through, vitest ignores what follows it, and the config stops the run rather than test the whole suite (`packages/astromech/tests/_support/vitest-base-config.ts`). Not `vitest related` either: the harness imports most of `src`, so it selects most of the suite and runs slower than all of it.
- **Before handing work back**: `pnpm -F <package> typecheck` and `pnpm -F <package> test:run`. The admin and the plugins compile core from source, so a change to core's `src` also needs their suites, or `pnpm run verify:fast`, which runs every package suite without coverage thresholds.
- **Before a change lands**: `pnpm run verify`. Coverage thresholds are checked only by a whole-suite coverage run (`pnpm run test:run`, inside `verify`), so after a failure rerun the whole suite, not the failed files.
- **Run one full suite at a time.** Parallel runs have been killed for low memory, and other sessions may share the checkout.
- **Keep output small.** Under Claude Code, Vitest 4.1 uses its agent reporter, which prints only failures; setting `reporters` in a config turns it off. It also hides console output. An error or warning fails its test anyway; to read other output, run with `--reporter=default --silent=false` and count it with `grep -c` rather than reading the log. Judge a run by its summary lines, not the exit code of a pipe.

## Coverage

Thresholds are set per directory in the `vitest.config.ts` of core, the admin and schema-engine, and in each plugin's `vitest.config.ts` through `pluginVitestConfig`'s `coverageThresholds`. A change that raises a directory's coverage raises its entry in the same commit. Coverage shows what is untested, not what is tested well, so don't write a test only to reach lines.

Mutation testing shows the other half: whether a test fails when a line changes, where coverage only shows the line ran. Core has it as a manual check, run on demand one directory at a time, because a run is slow (minutes for `src/utilities`, hours for all of `src`): `env -u NODE_ENV BETTER_AUTH_SECRET=check-boot-secret-0123456789abcdef pnpm -F astromech test:mutation src/utilities`. Never make it a gate. Read the surviving mutants by hand: about a third are equivalent mutants (the change does not alter behaviour), and a survivor that is a real gap gets an assertion. The first run, on files at 97% line coverage, found missing assertions and a bug in `deepEqual`.

## Reviewing a test change

Read a test diff as closely as the code. Look for a removed `expect`, a new `.skip`, `.only` or `vi.mock`, a loosened matcher, and a new test that cannot fail. `pnpm run report:drift` lists the first four (and lowered coverage thresholds); a loosened matcher and a test that cannot fail need a reader. For each new test, ask which behaviour it protects.
