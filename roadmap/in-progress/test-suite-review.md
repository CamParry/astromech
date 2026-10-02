# Test suite review

The principles the whole suite is reviewed against, and the review work that
follows. The principles come from outside research done on 2026-10-01, before
anyone read an Astromech test or the `testing` skill, so they are a yardstick
rather than a description of the suite. The earlier coverage review is
[test-suite-trust](../completed/test-suite-trust.md); gate speed is
[verification-gate-speed](../completed/verification-gate-speed.md).

The principles below include the changes the audit argued for. The `testing`
skill (`.claude/skills/testing/SKILL.md`) is the working form of them: goals and
their reasons rather than rules. This file holds the research, the audit
summary and the implementation plan. The audit reports themselves, with every
finding's file and line, are in `specs/test-suite-review/`, one per area, and
are deleted when this work ships.

## Sources

- **Matt Pocock**: the `tdd` skill and its `tests.md` and `mocking.md`
  (https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd),
  "How to test your types" (https://www.totaltypescript.com/how-to-test-your-types),
  "Tips for AI coding with Ralph Wiggum"
  (https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum), and his
  course-video-manager repo at commit `58b4c0e`
  (https://github.com/mattpocock/course-video-manager): 347 test files, real
  Postgres through PGlite, 6 `vi.mock` calls in total.
- **Payload** (https://github.com/payloadcms/payload): `CONTRIBUTING.md`,
  `AGENTS.md`, the per-feature `test/<feature>/config.ts` pattern and the Vitest
  fixtures in `test/__helpers/int/vitest.ts`.
- **Strapi** (https://github.com/strapi/strapi): `AGENTS.md`, the API test
  builder in packages/utils/api-tests/, and the CI matrix.
- **WordPress**: the core handbook
  (https://make.wordpress.org/core/handbook/testing/automated-testing/writing-phpunit-tests/),
  `tests/phpunit/includes/abstract-testcase.php` in wordpress-develop, and
  Gutenberg's testing overview and e2e guide
  (https://github.com/WordPress/gutenberg/blob/trunk/docs/contributors/code/e2e/README.md).
- **General**: Kent Beck's Test Desiderata (https://testdesiderata.com/);
  Vladimir Khorikov's _Unit Testing Principles, Practices, and Patterns_ and
  "When to mock" (https://enterprisecraftsmanship.com/posts/when-to-mock/);
  _Software Engineering at Google_, chapters 11 to 13
  (https://abseil.io/resources/swe-book/html/ch12.html); Martin Fowler's "The
  Practical Test Pyramid", "Mocks Aren't Stubs" and "Eradicating
  Non-Determinism in Tests" (https://martinfowler.com/articles/practical-test-pyramid.html);
  Kent C. Dodds on the testing trophy
  (https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications);
  Google's coverage guidance
  (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html);
  Node integration-test practices
  (https://github.com/testjavascript/nodejs-integration-tests-best-practices).
- **Agents**: Claude Code best practices
  (https://code.claude.com/docs/en/best-practices), Kent Beck's "Augmented
  coding" (https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes),
  Simon Willison's agentic engineering patterns
  (https://simonwillison.net/guides/agentic-engineering-patterns/first-run-the-tests/),
  Birgitta Böckeler's "Sensors for coding agents"
  (https://martinfowler.com/articles/sensors-for-coding-agents.html),
  ImpossibleBench (https://arxiv.org/abs/2510.20270), a study of mocking in
  agent commits (https://arxiv.org/abs/2602.00409), and the Vitest reporter and
  performance guides (https://vitest.dev/guide/reporters,
  https://vitest.dev/guide/improving-performance).

## The principles

The sources mostly agree on one thing: test behaviour through the public
surface, use the real versions of dependencies you own, and mock only what
crosses the process edge. The numbered rules below follow from that, and the
audit cites them by number.

### What to test

1. **Test behaviour, not structure.** A test that fails on a refactor that
   changes no behaviour is a defective test (Beck, Khorikov, Google, Pocock).
2. **One test per behaviour, not per method**, named for the outcome, such as
   "rejects a duplicate slug" (Google, the WordPress handbook, Payload,
   Gutenberg).
3. **Don't test what the type checker proves, trivial mappings, or thin
   delegation** (Pocock and course-video-manager, Khorikov's "trivial code"
   quadrant). Here, a route-table row needs no test of its own, because the
   table's own test covers the mechanism and the method's test covers the
   method; a hand-written route handler is tested through the real router.
4. **Don't test private code.** If a private function needs its own tests, move
   it into its own module (Khorikov, Fowler).
5. **A bug fix starts with a failing test that reproduces the bug** (Strapi's
   `AGENTS.md`, WordPress's `@ticket` links).
6. **Library code tests its public types.** Pocock says this pays for
   libraries and rarely for apps; Payload does it. Here a type-only test
   lives in a `*.test-d.ts` file beside its runtime file: `typecheck`
   compiles it through each package's `tsconfig.test.json` and vitest never
   runs it. That keeps vitest's `requireAssertions` on, so every runtime test
   must assert something. `expectTypeOf` inside a runtime test that also
   asserts is fine.

### Test doubles

7. **Prefer the real implementation, then a fake, then a mock** (Google).
8. **Never mock what you own**: your own modules, services or database. Mock
   only unmanaged, out-of-process dependencies: third-party HTTP, email, the
   clock and randomness (Khorikov, Pocock, Fowler). course-video-manager has 6
   `vi.mock` calls in 347 files and Payload's integration tests have 1.
   Strapi's 154 hand-built fakes of its app container are the warning case,
   because a fake container drifts from the real one. To reach a failure the
   database cannot produce, such as a write that fails mid-transaction, prefer
   a real SQLite trigger (`RAISE(ABORT)`) over a spy on a repository method.
   In the admin, the server is the edge: a test mocks the client module
   (`astromech/fetch`) and no other admin module.
9. **A hand-written fake has its own tests against the real thing**, so it
   cannot drift (Google, Fowler's contract tests).
10. **If something is hard to test without mocking your own code, change the
    design**: pass the dependency in, or split pure logic from I/O
    (course-video-manager's coding standards, the Vitest mocking guide).
11. **Assert on state and return values, not call counts**, except where the
    call is itself the visible outcome, such as an email sent or an outgoing
    request (Google, Khorikov). "Refused before the handler ran", asserted on
    a stub handler passed in, is such an outcome.

### Database

12. **Integration tests run on the production database engine.** Payload,
    Strapi, WordPress and course-video-manager all do. Google accepts
    in-memory fakes, but for SQLite the real engine already runs in memory.
13. **Reset before each test, not after.** Rolling back a transaction per test
    (WordPress, the Vitest recipe) is fastest, but it misses commit-time
    behaviour and any code that opens its own transaction. Truncating and
    re-inserting a seed snapshot (Payload, course-video-manager) avoids both.
    Unique keys per test with no cleanup allows parallel runs on one database.
    For file-backed SQLite, copying a database migrated once per run is the
    cheapest correct reset: 2.3 ms a test, against 13 ms to empty every table,
    19 ms for `:memory:` and 77 ms to migrate a new file (measured here).
14. **Check a write through the public read path, not raw SQL**, unless the
    point is that nothing was written (Pocock). Migration, DDL and
    storage-format tests are the exception, because the stored cell is the
    behaviour, as are tables a third party owns (Better Auth's), which have no
    read path of ours.

### How a test reads

15. **Every value the assertion depends on is visible in the test.** Shared
    helpers supply defaults only. Some repetition is fine if it keeps the test
    clear (Google's "DAMP, not DRY").
16. **No logic in tests.** Hard-code expected values rather than recompute them
    with the code under test (Google, Khorikov, Pocock's "tautological tests").
17. **Use the most specific assertion.** A failure message states what was
    expected, what happened and the relevant input (WordPress, Google).
18. **No large snapshots.** Small inline snapshots of error messages or
    serialised output are fine (Dodds, Gutenberg).
19. **No `as any` in tests.** Agents copy what they see; course-video-manager
    has 213 in its tests against 21 in its source. Use typed builders (Pocock).

### Fixtures and boot

20. **One shared fixture owns boot, reset and seed**, and tests never write
    their own. The app boots once per worker or file, not once per test
    (Payload's `AGENTS.md`).
21. **Factories fill in defaults and throw on failure.** WordPress's factories
    returned errors that went unchecked for years, which hid broken fixtures.
22. **Each feature or plugin has a small test config that can also run as a dev
    app** (Payload's `test/<feature>/config.ts`).
23. **One function resets every registry, the way boot sets it.** WordPress
    restores its global registry after every test and still finds leaks.
    Instance-owned registries would remove the need, but core's registries are
    global by decision (`DECISIONS.md`, "A repository is a plain module-level
    object"), so that is an architecture question, not a test rule. Until it
    changes, no test file resets global state by hand.

### Determinism and isolation

24. **Tests pass in any order and in parallel.** WordPress is still finding
    order-dependent tests years on.
25. **No real sleeps.** Use fake timers or an injected clock, and seed
    randomness (Fowler, Google).
26. **Unexpected signals fail the test**: outbound network calls, unexpected
    `console.error` or `console.warn`, deprecation warnings. A test declares
    the ones it expects (WordPress, Gutenberg).
27. **Retries hide flaky tests.** Zero locally, at most one in CI, and every
    retry reported. Payload's five Playwright retries and Strapi's quarantine
    are the warning cases. Reproduce a flake before fixing it.
28. **Lower expensive settings in test mode and record per-test timings.**
    WordPress lowered its password-hashing cost after CI started timing out.

### Measuring quality

29. **Coverage shows what is untested, not what is well tested.** Treat it as a
    floor, watched on changed code (Google's 60, 75 and 90% bands; Dodds puts
    diminishing returns at about 70%).
30. **Mutation testing, run from time to time on core logic**, shows whether
    the assertions actually catch changes. It is a better signal than coverage.
31. **Property-based tests (fast-check) for parsers, serialisers, validation
    and slug or path handling.**

## Tests that agents write and run

**Tier the suite by cost, not by level.** A fast tier of high-level tests is
backwards for an agent loop: high-level tests are the slowest and flakiest
(Google measured 14% of large tests as flaky against 0.5% of small ones) and
the worst at saying where a break is. The in-process tests are both the fast
ones and the detailed ones, so they form the fast tier.

Measured here, that comes out as three steps:

- **While iterating**: the test file being worked on,
  `pnpm -F <package> exec vitest run <path>` (about 2 s).
- **Before handing work back**: the package's typecheck and whole suite, plus
  the admin and plugin suites when core's `src` changed, because they compile
  core from source. Beck's "always run all the tests (except long-running
  tests)" applies once the package suite is fast: core takes 84 s today and
  25 s with the template database (stage 2a).
- **Before a change lands**: `pnpm run verify`, plus the boot and install
  checks, plus a shuffled run.

Two research suggestions lost on measurement. `vitest related` selected 152
files for an edit to one utility and ran slower than the whole suite, because
the harness imports most of `src`. Tags for slow tests have nothing to tag
once the template database lands, and the slow tier (boot, browser, install)
already runs outside vitest.

Speed comes from turning off per-file isolation where tests allow it
(course-video-manager went from 27.7s to 13.4s, keeping a separate isolated
project for the few files that mock modules), a database and app fixture scoped
to the worker, and a schema built once before the run. Vitest switches to a
failures-only reporter when it detects an agent; setting `reporters`
explicitly turns that off.

Agents go wrong with tests in known ways, and each has a guard:

- **They weaken or delete assertions to go green.** The rule is never to edit,
  skip or delete an existing assertion to make a test pass; if a test looks
  wrong, stop and say so. In ImpossibleBench a strict instruction like this cut
  cheating from over 85% to 1%.
- **They over-mock.** Agents add mocks in 36% of commits against 26% for
  people, so the mocking rule (principle 8) belongs in agent instructions.
- **They write too many trivial tests**, so the list of what not to test
  (principle 3) matters more for agents than for people.
- **They write tests that copy the implementation.** Write one failing test,
  then the code, one small slice at a time (Pocock, Willison). Pocock dropped
  the refactor step because agents never did it, and moved refactoring into
  review.
- **Test changes need a second look.** Flag removed `expect` calls, new
  `.skip` or `.only`, and new `vi.mock` calls in a diff automatically, and
  review test changes with a fresh-context reviewer.

## Where the sources disagree

- **Pyramid against trophy.** Google and Fowler want mostly unit tests; Dodds
  wants mostly integration tests. Much of the gap is vocabulary: Dodds's "unit"
  means mocked dependencies, while Khorikov's unit test uses real
  collaborators. For this CMS the working answer is mostly in-process tests on
  real SQLite with real collaborators, pure unit tests for complex logic, and
  few browser tests.
- **Rollback against truncate.** Rollback gives false passes when the code
  under test opens its own transaction, so the choice depends on the code.
- **Mocking outside services (Khorikov) against owned fakes (Google).** Use
  fakes with their own tests, and assert on the outgoing message only where
  that message is the visible outcome.
- **Coverage targets.** Every source treats coverage as a signal, not a goal.

## What the audit found

The suite stands on a sound base. Data tests run on real SQLite through the
real migration chain, core has no `as any`, no snapshots beyond the codegen
golden file and no `.skip` or `.only`, and the admin fails any test that makes
a request it did not mock. The problems, ranked by the cost of leaving them:

1. **Every database test migrates a new database.** That is 96% of core's test
   time. A scratch harness that copies a template migrated once per worker ran
   core in 25 s instead of 84 s, all 3,189 tests passing. `verify:fast` takes
   about 2.5 minutes.
2. **The harness copies boot instead of calling it.** It builds its own
   database connection and skips registering the storage, image and email
   drivers, so 18 files register a storage driver by hand and, with
   `isolate: false`, a file that forgets inherits the previous file's driver.
   Global state is reset by hand, differently, in several files. Plugins reach
   core six different ways in their tests.
3. **Order dependence.** A shuffled core run failed 4 tests: one D1 emulation
   test reads a table the previous test creates, and three hit the 5 s timeout
   under load.
4. **Mocks of owned code.** The session mock is unneeded in 5 of its 6 files.
   Admin tests mock the admin's own hooks. The assistant plugin mocks core, and
   its fake approvals restate the real rules without being checked against the
   real SQL. Backups builds its table with hand-written SQL that has drifted
   from its migration.
5. **Suites copied across resources.** About 158 tests repeat across entries,
   globals, media and users, and the plugin contract tests are copied three to
   five times. `packages/astromech/tests/content/resource-conformance.test.ts` already shows the cure.
6. **About 190 `as unknown as` and `as never` casts**, some in the shared
   test helpers that agents copy.
7. **Commands that mislead an agent.** `test:run -- <file>` runs the whole
   suite; `vitest related` selects most of it; nothing blocks `.only` or
   requires an assertion; passing runs print 21 stray stderr blocks that the
   agent reporter hides.
8. **Behaviour with no test**: `media.delete` removing the stored file, backups
   restore, download and permissions, several admin pages and modals, 13 CLI
   commands, and the types of `defineServiceMethod`.

The audit also found a live defect, now its own file:
[permission-catalogue-drifts-from-manifest](../completed/permission-catalogue-drifts-from-manifest.md).
A question about bound service methods throwing synchronously is in
`roadmap/backlog.md` to discuss separately.

## Implementation plan

From stage 2 on, each stage lands on main before the next starts. The audit
reports in `specs/test-suite-review/` name the files for every item. Stages 2b
and 4 touch many test files, so each runs on its own branch and worktree, one
commit per item, with the whole core suite run before and after to show the
test count did not drop.

### Stage 1: the live defect

Independent of the test setup, so it runs as its own small branch alongside any
other stage rather than ahead of them.

- [x] Fix [permission-catalogue-drifts-from-manifest](../completed/permission-catalogue-drifts-from-manifest.md),
      starting with its failing test.

### Stage 2a: the template database

Lands alone, before anything else in stage 2, because it touches only the
harness and eight test files and every later stage runs faster for it.

- [x] Build the migrated template database once per run in
      `packages/astromech/tests/_support/global-setup.ts`, `provide` its path,
      and have `createTestDb()` copy it. Close the template's connection, or
      turn off WAL, before the first copy: a copy of the `.db` file alone
      misses anything still in the write-ahead log. libsql opens a local file
      with a rollback journal, so closing the client is enough; global setup
      fails if a journal or WAL file is ever left beside the template.
- [x] Move the eight files that call `createFileTestDb` onto `createTestDb` and
      delete the helper. Core went from 70.9 s to 11.2 s, with the same 3,153
      tests.
- [x] Update the setup paragraph of the `testing` skill to describe the
      template database.
- [x] Measure `verify:fast` again, step by step, and pick the next speed target
      from the result. Run alone on a quiet machine: typecheck 25.6 s, package
      tests 35.7 s (core 13.4 s, admin 11.1 s), lint 17.6 s, `check:unused`
      7.8 s. The tests no longer dominate, so the next target is running only
      the packages a branch touched (stage 3).

### Stage 2b: one setup and reset

- [x] Extract the driver registration in `packages/astromech/src/astromech.ts`
      (storage, image, email) into one function that boot and the harness both
      call, and build the test database through the real libsql driver. Delete
      the 18 hand registrations. `registerDrivers` in
      `packages/astromech/src/register-drivers.ts`; 27 files lost a hand
      `setStorageDriver`. The registrations left are ones a test checks
      itself, listed in stage 4.
- [x] Add one `resetRuntime()` to the harness that resets every global registry
      the way boot sets it, and replace the per-file reset blocks
      (`cron/runner`, `scheduled-handler`, `plugin-runtime`, the auth cache).
      It empties `globalThis.__astromech`, so a registry added later is
      covered too, and `createTestDb()` calls it. Eleven files left the
      isolated list.
- [x] Add one plugin test helper to core's test support that registers a
      plugin for real on the harness database, and move all six plugins onto
      it. Have the assistant compile core from source like the others, if its
      `dist` dependency allows. `createPluginTestApp` in
      `packages/astromech/tests/_support/plugin-app.ts` serves forms, menus,
      redirects, seo and backups. The assistant compiles core from source but
      mocks it, so its move is part of the stage 4 assistant item.
- [x] Fix the D1 order dependency and set `BETTER_AUTH_URL` for tests. Then
      shuffle the existing runs (`sequence.shuffle`) rather than adding a
      second run, which cost 208 s. Confirm the seed appears in the output so
      a failure can be reproduced, and print it if Vitest does not. Vitest
      prints the seed on every run. Shuffling also found
      `entries-capabilities` sharing one database per file, and a product
      defect: [trashed-entry-slug-collision](../planned/trashed-entry-slug-collision.md).
- [x] Fail a test on an unexpected `console.error` or `console.warn`; an
      expected one is asserted. `tests/_support/console-guard.ts`, with
      `expectConsole` to declare output. A passing run prints no console
      output in any suite.

### Stage 3: agent guardrails

- [x] Make `pnpm -F <package> test:run -- <path>` run only that file, or fail
      loudly. Today pnpm passes the `--` through and vitest runs the whole
      suite (160 to 200 s instead of about 2 s). Without the `--` it already
      filters. Root `AGENTS.md` and the `testing` skill name the working
      command, but agents reach for this one first. It now fails in 0.4 s and
      names the right command: vitest's CLI parser moves everything after `--`
      out of the file filters, and pnpm 11 has no setting to drop it.
- [x] Share one base vitest config across packages for the settings that should
      not differ: `requireAssertions`, `allowOnly: false`, timeouts, the
      console policy and `restoreMocks`. Record why any package differs.
      `packages/astromech/tests/_support/vitest-base-config.ts`; schema-engine
      keeps a commented copy because it sits below core. Four type-only tests
      moved to `*.test-d.ts` files (principle 6).
- [x] Try the source-resolving plugins on threads without per-file isolation,
      and keep whichever is faster. Threads saved 12 to 14%; turning isolation
      off saved nothing more, so the plugins run on threads, isolated
      (`DECISIONS.md`).
- [x] A check in `report:drift` that lists, for the branch, removed `expect`
      calls, new `.skip` or `.only`, new `vi.mock` calls and lowered coverage
      thresholds, so a reviewer sees them.
- [x] Decide whether `verify:fast` runs only the packages a branch touched plus
      their dependents (a small script over `git diff`), now that each package
      suite is fast. No: `verify:fast` takes 100 to 110 s, but lint (about
      90 s) and typecheck (55 to 72 s) finish close behind the tests, so
      running fewer packages saves 10 to 20 s and risks missing a dependent.
      Type-aware lint is the next thing to speed up.

### Stage 4: clean-up

- [ ] Replace the session mock in five files with a `requestAs()` helper over
      the real request scope; keep it only in `request-scope.test.ts`.
- [x] Move the admin's own-hook mocks to the client edge, and add one shared
      admin render helper for the provider stack, router and real English
      strings. `renderAdmin` and its siblings in
      `packages/admin/tests/_support/render-admin.tsx`; tests assert the real
      English strings. One wrap remains: `entry-edit-locale-switch.test.tsx`
      watches `useEntryForm` for a transient partial `seo` group no output
      shows. Controls are found by `name`, because field labels name no
      control: [field-labels-name-no-control](../planned/field-labels-name-no-control.md).
- [x] Assistant: one contract suite run against both the fake approvals and
      the real repository, and stop mocking core and its own repositories. It now mocks only `ai`'s
      `streamText`. Its admin tests (`packages/plugins/assistant/tests/admin/`)
      still mock `astromech/ui` and their own `use-chat`.
- [x] Backups: build the table from the migration and the context from the
      plugin helper, and fix the `rotate` timestamps. Left after stage 2b: the
      libsql dump and restore tests still use a hand-written runs table, and
      `resolveKeep` replaces `ctx.globals` with a fake.
- [x] Assistant onto `createPluginTestApp`: `packages/plugins/assistant/tests/service/sessions.test.ts`,
      `loop/run`, `loop/request` and `sessions/repository` mock `astromech`,
      and `deleted-user` builds its own Kysely (needs the assistant's
      migrations in the harness chain).
- [ ] The hand registrations stage 2b left, each checked by its own test:
      `plugin-runtime` (`setEmailDriver`), `d1-local-emulation` and
      `dangling-relations` (`setDb`), `database-transaction-degrade`
      (`setDatabaseDriver`), `model-access` (`setAiModels`),
      `scheduled-handler` (`setSchedulerDriver`), the hand drivers in
      `astromech.test`, `scheduled-boot` and `middleware`, and
      `src/transport/cli/config.ts`, which calls `setDb` itself. Keep each one
      that is the behaviour under test; move the rest onto the config.
- [x] Plugin structure tests import core internals (`resolvePluginIdentity`,
      `resolveAdminResources`, `derivePluginNav`); assert through the
      manifest or the admin output instead.
- [ ] Fold the copied suites into conformance tables (versions, translation,
      relationships, field validation, definition, atomicity), and the plugin
      contract tests into one `it.each` over every plugin. The plugin half is done:
      `packages/astromech/tests/_support/plugin-contract.ts`, called from each
      plugin's `tests/contract.test.ts`.
- [ ] Inject atomicity failures with a SQLite trigger instead of repository
      spies, and delete the three tests that only check which repository a
      service calls.
- [ ] Replace raw-SQL write checks with the public read path where principle
      14 does not exempt them.
- [ ] Typed builders in `_support/` first (`createTestUser` returning a
      `User`, a `ResolvedConfig` builder, a field builder), then remove the
      casts that copy them.
- [ ] Replace the seven hand-written storage fakes with the filesystem driver,
      plus one `StorageDriver` contract test run against every driver.
- [ ] Delete or rewrite the tests that cannot fail (`cron-table`,
      `repository-surface`, `packages/astromech/tests/content/shared-helpers.test.ts`, the admin
      `cell-registry` case), fix the admin field-registry leak, rewrite
      `packages/astromech/tests/cron/runner.test.ts` and `method-manifest.test.ts` as tables, and move
      `permission-match.test.ts` off the retired permission grammar. The admin
      `cell-registry` case and the field-registry leak are done.

### Stage 5: missing coverage

- [ ] `media.delete` removes the stored file and its variants.
- [ ] Backups restore, download, run, delete and permissions.
- [ ] Admin: `EntryNewPage`, `DeleteEntryModal`, `CreateLocaleModal`,
      `CommandPalette`, `NotificationBell`, the backups page and the seo
      overview page.
- [ ] The 13 untested CLI commands and the assistant's chat route.
- [ ] Inline type tests for `defineServiceMethod`, `defineHook` and
      `defineConfig`.
- [ ] Coverage thresholds for the plugins and `schema-engine`.
- [ ] Property tests where they pay: `capIdentifier`, `renderLiteral`,
      `diffSnapshots`, `readChatRequest`, slug handling.
- [ ] Try mutation testing (Stryker, incremental) on one core directory, and
      keep it as an occasional check only if it finds assertions that miss.
