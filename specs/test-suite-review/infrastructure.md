# Test infrastructure audit

Date: 2026-10-01. Repo: `/Users/cam/Documents/Projects/Astromech`, `main` at `edf728be`.
Machine: 10 cores, 16 GB, load average 17 to 44 throughout (other sessions were
running). Every timing below is from one run on a loaded machine, so treat
absolute numbers as indicative and the ratios between runs as the signal.
Paired comparisons (current harness against template harness) ran back to back
at the same load.

Yardstick: `roadmap/in-progress/test-suite-review.md` (principle numbers cited as
P13 and so on), `.claude/_skills/testing/SKILL.md`, the `AGENTS.md` files,
`roadmap/completed/verification-gate-speed.md`,
`roadmap/completed/ci-runs-the-whole-gate.md`.

Raw outputs are in `runs/` next to this file; the scripts are in `bench/`,
`bench2/` and `analyze.mjs`.

## Summary

1. **The per-test migration chain is 96% of core's test time.** 1,448 of 3,189
   core tests sit in files that call `createTestDb()` in `beforeEach`, which
   builds a new file database and runs 13 migrations (9 app, 4 plugin) every time. Those tests
   account for 605 of 633 seconds of summed test time. Copying a migrated
   template file instead takes 2.3 ms against 77 ms, and a scratch copy of the
   harness that does this ran the whole core suite in **25 s instead of 84 s**,
   with all 3,189 tests passing.
2. `vitest related` and `--changed` give no speed-up: a leaf utility selects
   152 of 253 core files and ran slower than the whole suite.
3. The obvious single-file command, `pnpm -F astromech test:run -- <file>`,
   silently runs the whole suite (160 to 200 s instead of 1.6 s).
4. Tests time out under load at the default 5 s, and one test is
   order-dependent.
5. Nothing guards against an agent weakening tests, and the `testing` skill is
   disabled.

## 1. Vitest configs

| Package                               | Config source                                                                                | Pool                    | isolate                        | Env                                           | setupFiles                                     | globalSetup                                 | Coverage thresholds                                  | Reporters                                         | Retry | Timeouts                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------ | --------------------------------------------- | ---------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- | ----- | ----------------------------- |
| `astromech` (core)                    | own, 2 projects: `core`, `core-isolated`                                                     | threads                 | false / true (33 listed files) | node                                          | none                                           | `tests/_support/global-setup.ts` (temp dir) | per `src/*` dir, v8, `text-summary` + `json-summary` | default (so the agent reporter under Claude Code) | none  | default (5 s test, 10 s hook) |
| `@astromech/admin`                    | own, 3 projects: `admin`, `admin-isolated`, `admin-timezone`                                 | threads, threads, forks | false / true / true            | node; 56 files opt into happy-dom by docblock | `dom-setup.ts` (act env, cleanup, fetch guard) | none                                        | per `src/*` dir                                      | default                                           | none  | default                       |
| `@astromech/schema-engine`            | own, minimal                                                                                 | default (forks)         | default (true)                 | node                                          | none                                           | none                                        | none                                                 | default                                           | none  | default                       |
| forms, menus, redirects, backups, seo | shared `pluginVitestConfig()` in `packages/astromech/tests/_support/plugin-vitest-config.ts` | default (forks)         | default (true)                 | node                                          | none                                           | core's `global-setup.ts`                    | none                                                 | default                                           | none  | default                       |
| assistant                             | own; `@tests` alias only, core through `dist`                                                | default (forks)         | default (true)                 | node; 2 files happy-dom                       | none                                           | none                                        | none                                                 | default                                           | none  | default                       |

No package sets `testTimeout`, `hookTimeout`, `retry`, `bail`, `reporters`,
`onConsoleLog`, `slowTestThreshold`, `sequence`, `allowOnly`,
`expect.requireAssertions`, `maxWorkers` or `typecheck`. There is no root
vitest config or workspace, and `vitest` is not a root dependency.

Vitest 4.1.10 everywhere (core and admin declare `^4.1.0`, plugins `^4.1.10`;
one resolved version in the lockfile). `@vitest/coverage-v8` 4.1.10 in core
and admin only.

### Which differences are justified

- **Justified: the assistant resolving core through `dist`.** Its config says
  why: an alias would hide a broken exports map. The cost is that it needs a
  build, so `verify:fast` leaves it out (see section 2).
- **Justified: `admin-timezone` on forks.** A worker thread ignores a `TZ` set
  at runtime; one file needs it.
- **Justified: core and admin on threads with `isolate: false` plus an isolated
  list.** `verification-gate-speed.md` measured 61 s to 32 s. The list is kept
  honest by `tests/isolation-list.test.ts` through
  `tests/_support/isolation-check.ts`, which greps for `vi.mock`, `vi.doMock`,
  `vi.stubGlobal`, `vi.stubEnv`, `vi.resetModules` and `globalThis.__astromech`.
- **Justified: coverage thresholds only on core and admin.** They hold most of
  the code. The thresholds are per directory and "never lower" is in a comment.
  Weak spots: core `src/email/**` at 19/7/0/19, `src/utilities/**` 60/40,
  `src/transport/**` 65/62; admin `src/pages/**` 7/5/4/7.
- **Not justified: the five source-resolving plugins on forks with full
  isolation.** They load the same harness and core source as core does.
  Import dominates every plugin run: forms spends 20.4 s of summed import time
  against 3.3 s of tests. Nothing in them mocks a module (they are not in any
  isolated list). The shared config comment says "Plugins keep vitest's default
  per-file isolation", with no reason given.
- **Not justified, but harmless: schema-engine's bare config.** It runs in 1 s.
- **Not justified: no explicit timeout.** See finding 3.
- **Noise:** core and admin `vitest.config.ts` import `./tests/_support/...`
  without a file extension, so every run prints Vite's
  "`configLoader: 'native'` ... Add the file extension" warning (4 lines on
  stderr, every package except schema-engine and the assistant).

## 2. Scripts, gate, hook and CI

### Scripts

Every package: `test` = `vitest`, `test:run` = `vitest run`; core and admin add
`test:coverage` = `vitest run --coverage`. Root:

- `test` = `pnpm -F astromech test` (watch mode, core only).
- `test:run` = schema-engine `test:run` && core `test:coverage` && admin
  `test:coverage` && `pnpm -r -F "./packages/plugins/**" test:run`. Serial with
  `&&`, so the first failing package hides the rest.
- `verify:fast` (`scripts/verify.mjs --fast`): one stage, four checks at once:
  `typecheck:packages`, `test:packages` (schema-engine && core `test:run` &&
  admin `test:run` && the five source-resolving plugins; no coverage, no
  assistant), `lint`, `check:unused`. No build.
- `verify`: build, then test:run + lint + check:unused + check:node-imports +
  check:exports + check:docs, then typecheck, then routes:generate, then both
  boot checks.
- `verify:runtime`: build:js, then test:run + routes:generate, then both boot
  checks.

`verify.mjs` buffers each check's output and prints only `ok`/`FAIL` lines
plus, on failure, a summary of matching lines and the full output. So its
output is small on success.

### Pre-commit hook

`.husky/pre-commit`: `npx lint-staged` (eslint --fix and prettier on staged
`*.ts,tsx`; stylelint on css), then `check:exports` and `check:docs`. No tests
and no typecheck run in the hook.

### Claude Code hooks

`.claude/settings.json` has a PreToolUse hook that blocks destructive git and a
PostToolUse stylelint fix for `.css`. Nothing runs tests or typecheck after an
edit, and nothing inspects test diffs.

### CI (`.github/workflows/ci.yml`)

Jobs: `gate` (`verify` on Node 24), `runtime` (`verify:runtime` on Node 22),
`index` (relationships index parity), `backstop` (`format:check`, `lint:css`),
`install` (matrix npm/pnpm). No retries anywhere, no `--sequence.shuffle`.

Run 36868129678 (2026-10-01 13:21, success), from `gh run view --log`:

| Check (gate job)      | Time        |
| --------------------- | ----------- |
| build                 | 51.5 s      |
| check:docs            | 1.9 s       |
| check:exports         | 2.5 s       |
| check:node-imports    | 34.9 s      |
| check:unused          | 43.4 s      |
| lint                  | 65.5 s      |
| **test:run**          | **279.6 s** |
| typecheck             | 80.3 s      |
| routes:generate       | 1.1 s       |
| check:boot:cloudflare | 20.0 s      |
| check:boot            | 26.4 s      |
| Gate job total        | 8 min 26 s  |
| Runtime job total     | 5 min 40 s  |

`test:run` is the gate's critical path: stage 2 waits 280 s for it while its
siblings finish within 66 s.

### What an agent actually runs after an edit

`AGENTS.md` says "Run `pnpm run verify:fast` while working". Measured
components, one at a time (verify:fast runs them concurrently, so its wall
time is roughly the longest of them plus contention):

| Command                                                                        | Wall             | Output                      |
| ------------------------------------------------------------------------------ | ---------------- | --------------------------- |
| `pnpm -r -F "./packages/**" typecheck`                                         | 69.3 s (load 34) | 27 lines, 1.3 KB            |
| `pnpm -F astromech typecheck` (warm incremental)                               | 16.7 s           | 2 lines                     |
| `pnpm run lint`                                                                | 76.4 s (load 29) | 23 lines, 0.9 KB            |
| `pnpm run check:unused`                                                        | 22.9 s           | a few lines (one knip hint) |
| test:packages, serial sum: schema 1.0 + core 84.3 + admin 29.8 + 5 plugins ~28 | ~143 s           |                             |

So `verify:fast` costs at least 2.5 minutes on this machine today, against the
55 s recorded in `verification-gate-speed.md`. Load explains part of that;
the test stage is the floor. An agent following the instruction after every
edit spends minutes per iteration, and the 30-second fast tier in
`test-suite-review.md` is out of reach without the harness change.

## 3. Measurements

Commands (`S` was a session scratchpad directory holding the run logs, JSON reports and bench scripts; it no longer exists):

```sh
cd packages/<pkg> && /usr/bin/time -l pnpm exec vitest run \
  --reporter=default --reporter=json --outputFile.json="$S/runs/<pkg>.json"
node "$S/analyze.mjs" "$S/runs/<pkg>.json" "$PWD/"
```

`dist` was fresh (`scripts/require-fresh-dist.mjs` passed; another session had
built at 15:22), so the assistant suite ran without a build.

### Timing table

"import" and "tests" are vitest's summed-across-workers figures.

| Suite                                | Files | Tests |                  Wall | Vitest duration | Import (sum) |                       Tests (sum) | Peak RSS |     Load |
| ------------------------------------ | ----: | ----: | --------------------: | --------------: | -----------: | --------------------------------: | -------: | -------: |
| schema-engine                        |     9 |   102 |                0.97 s |          0.46 s |        1.6 s |                             0.2 s |   164 MB |       18 |
| core                                 |   253 | 3,189 |                84.3 s |          81.3 s |       81.6 s |                           638.0 s |  1.64 GB | 19 to 27 |
| core with coverage (`test:coverage`) |   253 | 3,189 |               119.0 s |         114.7 s |      127.9 s |                           859.2 s |          |       26 |
| core, **template harness** (scratch) |   253 | 3,189 |            **25.4 s** |          24.7 s |      100.4 s |                           105.7 s |          | 27 to 28 |
| core shuffled (seed 20261001)        |   253 | 3,189 | 207.8 s, **4 failed** |         193.8 s |      264.9 s |                         1,424.8 s |          |       31 |
| admin                                |    74 |   498 |                29.8 s |          28.6 s |      150.1 s | 49.4 s (env 37.0 s, setup 13.4 s) |  1.78 GB |       18 |
| admin shuffled                       |    74 |   498 |          41.3 s, pass |          39.6 s |      206.4 s |                            56.8 s |          |       21 |
| forms                                |     9 |   118 |                 6.5 s |           5.7 s |       20.4 s |                             3.3 s |   210 MB |          |
| menus                                |     3 |    21 |                 5.7 s |           4.8 s |        8.7 s |                             2.0 s |   199 MB |          |
| redirects                            |     5 |    43 |                 6.9 s |           6.1 s |       12.5 s |                             7.7 s |   185 MB |          |
| backups                              |     4 |    26 |                 4.2 s |           2.9 s |        9.8 s |                             0.4 s |   233 MB |          |
| seo                                  |     6 |    42 |                 4.4 s |           3.5 s |        7.9 s |                             1.4 s |   232 MB |          |
| assistant                            |    12 |   117 |                 3.7 s |           2.7 s |       12.3 s |                             0.5 s |   224 MB |          |

Single-file and selection runs:

| Command                                                                         |                  Wall | Selected                     |
| ------------------------------------------------------------------------------- | --------------------: | ---------------------------- |
| `pnpm -F astromech test:run tests/utilities/labels.test.ts`                     |                 1.6 s | 1 file, 6 tests              |
| `pnpm -F astromech exec vitest run tests/entries/service.test.ts`               | 14.1 s (10.9 s tests) | 1 file, 103 tests            |
| same, `-t "rejects"`                                                            |                 9.2 s | 19 run, 84 skipped           |
| three heavy files (service, create-repository, users-contract), current harness | 13.8 s (tests 21.3 s) | 199 tests                    |
| same three, template harness                                                    |   3.3 s (tests 2.1 s) | 199 tests, all pass          |
| `pnpm -F astromech exec vitest related src/utilities/deep-equal.ts --run`       |               104.9 s | 152 files, 1,689 tests       |
| `pnpm -F astromech exec vitest related src/entries/service.ts --run`            |               135.1 s | 151 files, 1,684 tests       |
| `pnpm -F astromech test:run -- tests/utilities/deep-equal.test.ts`              |       200.3 s, exit 1 | whole suite (filter dropped) |
| `pnpm -F astromech test:run -- tests/utilities/labels.test.ts`                  |         159.9 s, pass | whole suite (filter dropped) |

### Core: 15 slowest files (current harness, load ~20)

JSON `startTime`/`endTime` exclude import, so file wall equals test-body sum.

|     ms | Tests | File                                                     |
| -----: | ----: | -------------------------------------------------------- |
| 44,775 |   103 | tests/entries/service.test.ts                            |
| 25,983 |    62 | tests/database/create-repository.test.ts                 |
| 19,755 |    42 | tests/transport/http/routes/openapi-document.test.ts     |
| 14,976 |    36 | tests/entries/repository/entries-table.test.ts           |
| 14,145 |    34 | tests/transport/http/routes/users-contract.test.ts       |
| 13,763 |    32 | tests/content/resource-conformance.test.ts               |
| 13,374 |    32 | tests/entries/field-validation.test.ts                   |
| 12,721 |    29 | tests/entries/staging.test.ts                            |
| 12,488 |    29 | tests/globals/staging.test.ts                            |
| 12,015 |    29 | tests/transport/http/routes/entries-crud.test.ts         |
| 12,010 |    24 | tests/transport/http/routes/entries-query-params.test.ts |
| 11,556 |    26 | tests/transport/http/routes/media-contract.test.ts       |
| 11,019 |    27 | tests/transport/http/routes/globals-mounted.test.ts      |
|  9,871 |    20 | tests/transport/http/routes/entries-bulk.test.ts         |
|  9,596 |    22 | tests/media/serving/handler.test.ts                      |

The slowness is per test, not per file: these are simply the files with the
most database-backed tests. Top 15 hold 37.6% of summed file time.

Per-test distribution: 1,659 tests under 10 ms, then a second hump: 1,191
tests between 250 and 500 ms. Split by whether the file calls `createTestDb()`:

| Group                          | Tests |     Sum | Median |    p10 |    p90 |
| ------------------------------ | ----: | ------: | -----: | -----: | -----: |
| Files calling `createTestDb()` | 1,448 | 605.4 s | 425 ms | 331 ms | 527 ms |
| All other files                | 1,741 |  27.7 s | 0.2 ms | 0.1 ms | 6.7 ms |

`/usr/bin/time` on the core run: 156 s user, **286 s sys**. A system-time
figure nearly twice user time points at file I/O (creating, migrating and
syncing ~1,450 SQLite files), which worsens with parallel workers: the same
file alone costs 105 ms per test, against 425 ms median in the full run.

### Core with the template harness: 15 slowest files

|     ms | Tests | File                                                     |
| -----: | ----: | -------------------------------------------------------- |
| 11,457 |    29 | tests/entries/staging.test.ts                            |
|  6,950 |    42 | tests/transport/http/routes/openapi-document.test.ts     |
|  3,693 |   103 | tests/entries/service.test.ts                            |
|  3,543 |     8 | tests/transport/http/routes/entries-staging.test.ts      |
|  2,561 |    14 | tests/auth/first-admin.test.ts                           |
|  2,528 |    21 | tests/transport/http/routes/entries-permissions.test.ts  |
|  2,411 |    21 | tests/transport/http/routes/rpc-parity.test.ts           |
|  2,391 |    24 | tests/transport/http/routes/entries-query-params.test.ts |
|  2,271 |    29 | tests/transport/http/routes/entries-crud.test.ts         |
|  1,790 |    56 | tests/codegen/method-manifest.test.ts                    |
|  1,762 |    18 | tests/transport/http/routes/app-root.test.ts             |
|  1,673 |    36 | tests/entries/repository/entries-table.test.ts           |
|  1,660 |     5 | tests/auth/session.test.ts                               |
|  1,582 |     4 | tests/users/atomicity.test.ts                            |
|  1,482 |    34 | tests/transport/http/routes/users-contract.test.ts       |

`entries/staging.test.ts` and `entries-staging.test.ts` stay slow because they
call `createFileTestDb()` on their own paths, which the template copy does not
cover (finding 2). After the change, import time (100 s summed) is the largest
cost, and the next lever is fewer, larger module graphs rather than the
database.

### Top 10 tests (current harness)

All 1.0 to 1.4 s, all database-backed, none outstanding:
`globals-versions.test.ts` "lists a version per replaced state" 1,359 ms;
`entries/authorship.test.ts` 1,278 ms; `globals/hooks.test.ts` 1,261 ms;
`users-versions.test.ts` 1,241 ms; `rest-route.test.ts` 1,231 ms;
`media/field-validation.test.ts` 1,226 ms; `transport/cli/methods.test.ts`
1,212 ms; `entries-staging.test.ts` 1,079 ms; `users/no-content-row.test.ts`
1,057 ms; `globals/hooks.test.ts` 862 ms.

### Admin: what dominates

Import (150 s summed) and happy-dom environment setup (37 s) dominate; test
bodies are 49 s. The 15 slowest files are all component tests; they hold 71%
of file time. Slowest: `entry-edit-locale-switch.test.tsx` 4.1 s (one test
2.9 s), `global-edit-page.test.tsx` 3.7 s, `admin-resource-pages.test.tsx`
3.4 s, `media-detail-modal.test.tsx` 2.7 s, `user-new-page.test.tsx` 2.5 s,
`stateful-field-seeding.test.tsx` 2.3 s, `entry-edit-cache-invalidation.test.tsx`
2.1 s (one test), `user-edit-page.test.tsx` 2.1 s, `plugin-field-loading.test.tsx`
2.1 s, `data-list.test.tsx` 1.9 s, `container-field-editing.test.tsx` 1.8 s,
`leaf-field-controls.test.tsx` 1.8 s, `users-list-page.test.tsx` 1.5 s,
`media-detail-modal-replace.test.tsx` 1.3 s, `media-picker.test.tsx` 1.2 s.
Median test 8.8 ms.

### Plugins

Import dominates each run. Slowest files: `redirects/tests/redirects.test.ts`
3.4 s, `forms/tests/forms.test.ts` 2.3 s, `redirects/tests/hooks/slug-change.test.ts`
2.3 s, `menus/tests/menus.test.ts` 1.8 s, `redirects/tests/service/redirects.test.ts`
1.5 s, `seo/tests/service/seo.test.ts` 1.4 s. 11 plugin test files use
`createTestDb`, so they gain from the template change too.

## 4. The harness (`packages/astromech/tests/_support/`)

- `global-setup.ts` (core and source-resolving plugins) makes one temp
  directory per run and passes it to workers with `provide`; teardown removes it.
- `harness.ts` `createTestDb()` makes a new file-backed libsql database named
  by `crypto.randomUUID()`, registers it globally with `setDb` and
  `setDatabaseDriver`, dynamically imports `apps/demo/migrations/index.ts` and
  the redirects, backups and forms migration providers, merges them and runs
  `migrateToLatest` (9 app migrations plus 4 plugin migrations, 23 tables).
  Files are never closed or deleted before the run ends.
- Usage: 144 test files call it; 117 call sites are in `beforeEach`, 5 in
  `beforeAll`. So the database is rebuilt **per test**, not per file or worker.
  This meets P13 (reset before each test) at the highest possible price, and
  misses P20 (boot once per worker or file).
- Eight files build their own database with `createFileTestDb()` at their own
  path and delete it in `afterEach`: `entries/staging.test.ts`,
  `entries/staging-atomicity.test.ts`, `entries/create-atomicity.test.ts`,
  `entries/restore-atomicity.test.ts`, `entries/duplicate-atomicity.test.ts`,
  `transport/http/routes/entries-staging.test.ts`, `users/atomicity.test.ts`,
  `media/atomicity.test.ts`. Eight more under `tests/database/` and
  `schema-engine/tests/` open their own clients on purpose (migration and DDL
  tests), which is fine.
- Disk: each database is about 350 KB, so a core run writes roughly 500 MB of
  temp files. A killed run leaves its directory behind: two `astromech-test-*`
  directories (108 MB) from other sessions' runs were in `$TMPDIR`.
- `setupTestConfig` publishes config through `config/registry.ts`, and
  `registerPlugins` resets the plugin runtime: module-level registries (P23).
  Each test resets them, and `isolate: false` means a file that forgets to call
  them inherits the previous file's database, config and plugins.

### Boot cost, measured (`bench/db-cost.test.ts`, 10 runs each after a warm-up, one thread)

| Strategy                                        |     Median |  Min |   Max |
| ----------------------------------------------- | ---------: | ---: | ----: |
| `createTestDb()` (file, full migration chain)   |    76.7 ms | 63.4 | 113.0 |
| `createFileTestDb(':memory:')` (full chain)     |    19.2 ms | 15.3 |  21.3 |
| copy a migrated template file, open, one select | **2.3 ms** |  0.9 |   4.1 |
| `DELETE FROM` all 23 tables with FKs off        |    13.3 ms |  8.8 |  18.0 |

### Can it be worker-scoped or snapshotted? Yes, and it was tried

`bench/harness-template.ts` is the real harness with one change: the first
`createTestDb()` in a worker migrates `template-<pid>-<threadId>.db` once, and
every call after that copies the file and opens it. It is wired in through an
alias in `bench/vitest.core-template.config.ts`, which mirrors core's two
projects. No repo file was edited.

```sh
cd packages/astromech && pnpm exec vitest run \
  --config "$S/bench/vitest.core-template.config.ts" \
  --reporter=default --reporter=json --outputFile.json="$S/runs/core-template.json"
```

Result: 253 files, 3,189 tests, all pass, 25.4 s wall against 84.3 s, test
time 106 s against 638 s, at the same load. This keeps the file-backed
connection pool the harness comment asks for, keeps a fresh database per test
(P13), and runs the migrations once per worker (P20). A cleaner version builds
the template once in `global-setup.ts` and `provide`s its path, so every worker
copies the same file.

Alternatives and why they lose:

- **`:memory:`**: 4x faster than today but 8x slower than a copy, and the
  harness comment explains it changes transaction behaviour
  (`TRANSACTION_ACTIVE` instead of a second pooled connection).
- **Transaction rollback per test**: the suite has six `*-atomicity` files and
  services that open their own transactions; P13 and "Where the sources
  disagree" both say rollback gives false passes here.
- **Truncate per test on a worker database**: 13 ms, six times the copy, and it
  needs a table list and FK handling that drifts as tables are added.

## 5. Agent fit

- **The agent reporter.** Under Claude Code (`CLAUDECODE`/`AI_AGENT` set), with
  no `reporters` in any config, vitest picks `agent` (its `MinimalReporter`:
  `silent: 'passed-only'`, failed files and tests only). Output: 626 bytes for
  a full passing core run with coverage; 1.6 KB for one failing test
  (`runs/agent-fail.log`). That is good for an agent's context. The cost is
  that a passing test's `console.warn`/`console.error` is hidden, and there are
  no per-file timings, so an agent cannot see a test getting slow or noisy.
  With `--reporter=default` the core log is 1,641 lines, 108 KB.
- **`vitest related` and `--changed` do not help.** Because nearly every core
  test imports the harness, and the harness imports app-context, config,
  plugin runtime and the database layer, almost every source file reaches
  about 150 test files. `related` on a leaf utility selected 152 of 253 files
  and took 105 s, longer than the full run. `--changed` uses the same graph. And
  core's `related` cannot see admin or plugin tests, which compile core from
  source through `coreAliases()`.
- **Running one file from the repo root.** There is no root vitest. What works:
  `pnpm -F astromech exec vitest run tests/x.test.ts` or
  `pnpm -F astromech test:run tests/x.test.ts` (paths relative to the package),
  1.6 s for a pure file. What does not: `pnpm -F astromech test:run -- tests/x.test.ts`.
  pnpm 11 forwards the `--`, vitest then ignores the filter, and the whole
  suite runs (160 s and 200 s in two tries). `vitest list --filesOnly -- <file>`
  confirms it: 257 lines against 1. No `AGENTS.md` names the single-file
  command; `packages/plugins/AGENTS.md` and `packages/admin/AGENTS.md` name only
  the package-level `test:run`.
- **Tags and projects.** No Vitest 4.1 tags. Projects exist only to split by
  isolation (and timezone), not by cost. Nothing marks a slow test.
- **Retries:** none in any config or in CI. Meets P27.
- **`.only` and `.skip`:** none in the tree today (grep for
  `(it|test|describe).(only|skip|todo|skipIf|runIf)(`). Not blocked: vitest's
  `allowOnly` defaults to true outside CI, so a stray `.only` silently narrows
  a local run (CI would fail it). No ESLint rule (no `eslint-plugin-vitest`
  or `no-restricted-syntax` entry). `.skip` passes everywhere.
- **Weakening assertions or adding mocks:** no guard. No hook or script
  compares `expect` counts or flags new `vi.mock`, `.skip` or `.only` in a
  diff. `expect.requireAssertions` is off, so a test with no assertion passes.
  The isolation check catches a new `vi.mock` only to demand the file be
  listed, which an agent satisfies by listing it. Threshold "never lower" is a
  comment. 68 `vi.mock` calls in 43 files today.
- **The `testing` skill is disabled.** It lives in `.claude/_skills/testing/`,
  while `AGENTS.md` says the conventions "live in the skills under
  `.claude/skills/`". So an agent writing a test gets no convention loaded.
  `.claude/_agents/tester.md` (also disabled) contradicts the skill: it asks
  for `'should [behavior]'` names and "a test D1 instance".
- **Casts:** 1 `as any`, 189 `as never` / `as unknown as` in tests (P19).

## 6. Determinism

- **Order (P24).** A shuffled core run
  (`--sequence.shuffle --sequence.seed=20261001`) failed 4 tests:
    - `tests/integrations/cloudflare/d1-local-emulation.test.ts` "maps insertId
      and affected-row counts from D1 meta": `no such table: round_trip`. The
      table is created by the previous test, "performs a full CRUD round-trip"
      (line 87). A real order dependency.
    - Three timeouts at 5,000 ms in isolated files:
      `app-root.test.ts` "GET /openapi.json 401s without a session" and "answers
      403 to a sign-up", `plugins-contract.test.ts` "enforces a raw route's
      declared permission". Each builds the app with `createHttpApp` and a fresh
      database inside the test; in an isolated file the first such test also
      pays the cold module graph. Under load 31 that passes 5 s.
      The admin passes shuffled. CI never shuffles.
- **Unexplained failure.** One unshuffled core run (`test:run -- <file>`, 200 s,
  load ~30) exited 1. I did not capture its output, and the next identical run
  passed. Most likely the same 5 s timeouts; memory notes record a
  `SQLITE_MISUSE` flake in `patch-update` and CI timeouts on starved runners.
- **Timeouts (P28).** Every config uses vitest's 5 s default. Healthy tests
  take 0.3 to 1.4 s at load 20 and longer at load 30, so the margin is about
  4x and shrinks with load. The template harness widens it by cutting
  database tests by ~80%.
- **Global registries (P23).** `setDb`, `setDatabaseDriver`, `setConfig`,
  `registerPlugins`, `globalThis.__astromech` are module-level and shared by
  every file in a worker under `isolate: false`. Tests reset them per test;
  nothing fails a file that forgets. The isolation list stops files that
  _write_ `globalThis.__astromech` or mock modules from sharing a graph.
- **Fake timers and sleeps (P25).** 12 files use fake timers, all fake only
  `Date` (or are scoped) and restore with `useRealTimers`. One `setTimeout`
  in a test: `auth/database.test.ts` `wait(0)`, a yield, not a sleep. 53 uses of
  `Date.now()`/`Math.random()` in tests; no seeded randomness helper.
- **Outbound network (P26).** Blocked only in admin happy-dom files
  (`dom-setup.ts` fails the test on any unmocked `fetch`, naming the URL).
  Core, plugin and node-environment admin tests have no guard.
- **Console noise (P26).** No `onConsoleLog` policy anywhere. Passing runs
  print, on stderr: core 21 blocks (15 Better Auth "Base URL is not set",
  because `BETTER_AUTH_URL` is unset in tests; a password-reset URL log; two
  "Could not record plugin ... 'db' is not configured"); admin 9 blocks (6
  react-i18next "pass in an i18next instance", 3 TanStack Router
  "notFoundError ... notFoundComponent"); forms 1 (an expected SMTP failure
  log). The agent reporter hides all of them.

## Findings ranked by cost

1. **Per-test migration chain** (P13, P20, P28). 96% of core test time; 25 s
   against 84 s when replaced by a template copy; also the root of the
   load-sensitive timeouts and the 280 s CI critical path.
2. **`verify:fast` is not a fast loop.** About 2.5 min here (test stage
   ~143 s serial, typecheck 69 s and lint 76 s alongside), and it is what
   `AGENTS.md` tells an agent to run while working.
3. **Load-sensitive 5 s timeouts and one order-dependent test** (P24, P27).
   3 timeouts and 1 order failure in a shuffled run; one unexplained failure.
4. **The single-file trap.** `test:run -- <file>` runs everything (160 to
   200 s) and no AGENTS.md names the working command.
5. **`vitest related` / `--changed` select ~60% of the suite** and are slower
   than running it all, so file-level selection is not an option.
6. **Eight files bypass the shared database fixture** (P20); `staging.test.ts`
   becomes the slowest file once the template lands.
7. **No guard against weakened tests** (removed `expect`, `.skip`, `.only`,
   new `vi.mock`, no `requireAssertions`), and the `testing` skill is disabled.
8. **Coverage adds 42% to core** (119 s against 84 s). Right for the full
   check, wrong for the fast one; `verify:fast` already omits it.
9. **Console and network signals are not enforced outside admin DOM files**
   (P26), and the agent reporter hides them.
10. **Config drift between packages.** Plugins on forks with full isolation for
    no stated reason (import 6x test time in forms); no shared timeout,
    console, or `requireAssertions` settings; extensionless config imports
    print a Vite warning on every run; the root `test:run` stops at the first
    failing package.

## Proposal: fast check and full check

### Fast check (after each edit; target under 30 s)

1. Iterate on one area:
   `pnpm -F <pkg> exec vitest run tests/<path>` (1.6 s for a pure file; about
   3 s for a database file once the template lands).
2. Before handing back: the touched package's typecheck and whole suite,
   `pnpm -F <pkg> typecheck && pnpm -F <pkg> test:run`. With the template,
   core is ~25 s at load 27 and admin ~30 s. When core `src` changed, add
   the packages that compile it from source:
   `pnpm -F @astromech/admin -F @astromech/forms -F @astromech/menus -F @astromech/redirects -F @astromech/backups -F @astromech/seo test:run`.
   A small script can map `git diff --name-only` to packages and their
   dependents; that is package-level `related`, which survives dynamic imports
   and config changes in a way file-level selection does not.
3. Keep the agent reporter (it is compact) but add a console policy so what it
   hides fails instead.

### Full check (before a change lands)

Unchanged: `pnpm run verify` (build, every suite with coverage, lint,
`check:unused`, `check:node-imports`, `check:exports`, `check:docs`,
typecheck, both boot checks), CI's `verify:runtime`, `check:install`,
`backstop`. Add to CI only: `--sequence.shuffle` with the seed printed, and a
JSON report kept as an artifact for per-test timings (P28).

`verify:fast` stays as the pre-commit, all-packages, no-build tier.

### What has to change first, in order

1. Build the migrated template once in `global-setup.ts`, `provide` its path,
   and make `createTestDb()` copy it. Move the eight `createFileTestDb` files
   onto it (a named-path variant can still copy the template).
2. Fix `d1-local-emulation.test.ts` so each test creates its own table, then
   shuffle in CI.
3. Name the single-file command in `AGENTS.md` and warn against `--`.
4. Add `expect: { requireAssertions: true }` and `allowOnly: false` to every
   config, a shared `onConsoleLog` (or `console` spy) policy, and set
   `BETTER_AUTH_URL` for tests.
5. Add a test-diff check (removed `expect`, new `.skip`/`.only`/`vi.mock`) to
   the hook or a Claude Code PostToolUse hook, and move the `testing` skill to
   `.claude/skills/`.
6. Put the plugins on threads; measure whether `isolate: false` holds for them
   (they mock nothing).

### Alternatives that lost

- **File-level selection (`vitest related`, `--changed`)**: selects ~60% of the
  core suite for a leaf edit and ran slower than the whole suite (105 s against
  84 s). The harness pulls in most of `src`.
- **Vitest 4.1 tags for slow tests**: after the template, nothing in-process is
  slow enough to tag (slowest file 11 s, and that one is fixable). The slow
  tier is the boot, browser and install checks, which already live outside
  vitest. Revisit if a file stays above a few seconds.
- **One root workspace config**: `verification-gate-speed.md` measured no speed
  gain over three invocations, and it broke the wrangler test that reads the
  working directory. It would give one command from the root, but the
  per-package commands are short enough.
- **Coverage in the fast check**: +42% time for a number an agent should not
  be steering by mid-edit.
- **`:memory:`, rollback or truncate instead of a template copy**: see
  section 4.
- **A non-agent reporter for agents**: `--reporter=default` is 108 KB for a
  core run; the agent reporter is 0.6 KB passing and 1.6 KB per failure. Keep
  it and make console output fail instead of relying on seeing it.
