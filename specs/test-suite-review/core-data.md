# Core data-layer test audit

Scope: `packages/astromech/tests/` directories `database`, `entries`, `content`,
`fields`, `services`, `globals`, `media`, `users`, `storage`, and `_support/`.
Yardstick: the 31 principles in `roadmap/planned/test-suite-review.md` (cited as P1 to P31).
Read-only audit done on 2026-10-01. No tests were run. The coverage figures come
from `packages/astromech/coverage/coverage-summary.json`, dated 2026-09-28.

Files read in full (29): `_support/harness.ts`, `fixtures.ts`, `global-setup.ts`,
`isolated-tests.ts`, `isolation-check.ts`, `mount-router.ts`, `strict-input.ts`,
`auth.ts`; `entries/service.test.ts`, `entries/create-atomicity.test.ts`,
`database/cron-table`, `column-formats`, `foreign-key-check`, `plugin-tables`,
`drivers/database-transaction-degrade`, `drift`, `baseline-ddl-parity`, `codec`,
`drivers/libsql`; `content/repository-surface`, `unique`, `shared-helpers`,
`jobs/scheduled-publish`; `globals/globals-config.ts`, `globals/service`;
`media/definition`, `media/media-config.ts`, `media/service`; `users/users-config.ts`;
`services/define-service`, `fallback`, `strict-input`; `storage/prefix`.
I read substantial parts of another ~20 files, including `entries/repository/entries-table`,
`database/create-repository`, `entries/staging`, `entries/patch-update`,
`entries/write-policy`, `entries/entries-capabilities`, `entries/visibility`,
`content/resource-conformance`, `globals/hooks`, `globals/repository`,
`users/translatable`, `users/atomicity`, `users/last-admin`, `users/password-reset`,
`users/role-validation`, `media/serving/handler`, `storage/drivers/s3`,
`storage/drivers/r2`, `database/drivers/d1`, `database/entry-content-migration` and
`fields/parse-fields`.

## Counts

| Pattern                                                | database | entries | content | fields | services | globals | media | users | storage | \_support |  Total |
| ------------------------------------------------------ | -------: | ------: | ------: | -----: | -------: | ------: | ----: | ----: | ------: | --------: | -----: |
| test files                                             |       21 |      27 |      10 |     19 |        4 |      12 |    18 |    12 |       4 |       n/a |    127 |
| tests (`it`/`test`)                                    |      162 |     362 |      86 |    458 |       34 |     110 |   204 |    86 |      72 |       n/a |  1,574 |
| `expect(`                                              |      299 |     696 |     176 |    603 |       57 |     204 |   362 |   172 |     136 |         0 |  2,705 |
| `vi.mock(` / `vi.doMock(`                              |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |  **0** |
| `vi.fn(`                                               |        0 |       0 |       1 |      6 |        1 |       0 |     0 |     0 |       1 |         0 |      9 |
| `spyOn(`                                               |        4 |      13 |       3 |      0 |        1 |       3 |     8 |     4 |       0 |         1 |     37 |
| of which on owned code (not console, fetch or process) |        1 |      12 |       1 |      0 |        0 |       1 |     2 |     3 |       0 |         0 | **20** |
| `toHaveBeenCalled*`                                    |        2 |       0 |       1 |      6 |        6 |       0 |     3 |     1 |       0 |         0 |     19 |
| `as any`                                               |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |  **0** |
| `as never`                                             |        7 |       2 |       0 |      0 |        0 |      11 |     4 |     2 |       0 |         2 |     28 |
| `as unknown as`                                        |       10 |       5 |       1 |      0 |        2 |       1 |     2 |     2 |       0 |         2 |     25 |
| `setTimeout`                                           |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |      0 |
| snapshots                                              |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |      0 |
| `.skip` / `.only` / `.todo`                            |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |      0 |
| `it('should …')`                                       |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |      0 |
| arrow-style names (`a → b`)                            |        0 |       0 |       0 |     83 |        0 |       0 |    17 |     0 |       0 |       n/a |    100 |
| numbered names (`'6. …'`)                              |        0 |       0 |       0 |      0 |        0 |       0 |     8 |     0 |       0 |       n/a |      8 |
| `useFakeTimers`                                        |        2 |       6 |       2 |      0 |        0 |       1 |     2 |     0 |       0 |         0 |     13 |
| raw reads (`selectFrom`, `sql\``)                      |       49 |      27 |       6 |      0 |        0 |       3 |     1 |     1 |       0 |         1 |     88 |
| `createTestDb(`                                        |       11 |      19 |       6 |      0 |        0 |      13 |    12 |    11 |       0 |         5 |     77 |
| `spyOn(console…).mockImplementation`                   |        0 |       1 |       2 |      0 |        1 |       2 |     2 |     1 |       0 |         0 |      9 |
| `it.each` / `describe.each`                            |        1 |       2 |       6 |      4 |        0 |       0 |     0 |     0 |       0 |         0 |     13 |
| `expectTypeOf`                                         |        5 |       0 |       0 |      0 |        3 |       0 |     0 |     0 |       0 |         0 |      8 |
| fast-check                                             |        0 |       0 |       0 |      0 |        0 |       0 |     0 |     0 |       0 |         0 |      0 |
| files with no header comment                           |        1 |       1 |       1 |      9 |        0 |       0 |     8 |     0 |       4 |       n/a |     24 |

Other figures:

- **744 tests in 67 files rebuild a fully migrated database before every test.**
  Each rebuild runs the 9 app migrations plus 3 plugin baselines on a new file.
- **Largest files**: `entries/service.test.ts` has 1,521 lines,
  `fields/parse-fields-nested.test.ts` 1,021, `database/create-repository.test.ts` 1,012
  and `fields/parse-fields.test.ts` 1,000.
- **Error assertions use four styles**: `rejects.toMatchObject({ name, … })` 68 times,
  `rejects.toBeInstanceOf` 27, `rejects.toThrow(SomeError)` 27, and
  `rejects.toThrow(/regex/ | 'text')` 37.
- **The service handle has two names**: 34 files call it `const api = …`, 47 call it
  `const entriesService` (or the `globals`, `media` or `users` form), and 11 files
  define both (`const api = entriesService`).

## src → tests map

| src                           | tests                                                                | Notes                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/database/` (2,855 lines) | `tests/database/` (3,354 lines, 21 files)                            | Also holds tests of the demo app's migrations (`entry-content-`, `user-content-`, `users-role-migration`), of `transport/cli/commands/plugin-purge` (`plugin-purge.test.ts`) and of auth first-run (`fresh-generate`). Lowest coverage threshold in scope (78% lines). `drivers/libsql.ts` has 27.6% line coverage and `codec.ts` 69%. |
| `src/entries/` (3,628)        | `tests/entries/` (7,427, 27 files)                                   | Covered mostly through `currentServices.entries`. `entries/visibility.test.ts` tests `src/content/visibility.ts`. `repository/entries-table.test.ts` re-tests service behaviour at the private repository.                                                                                                                             |
| `src/content/` (2,832)        | `tests/content/` (1,847, 10 files) plus `entries/visibility.test.ts` | `shared-helpers.test.ts` collects early returns from six modules (coverage filler).                                                                                                                                                                                                                                                    |
| `src/fields/` (2,610)         | `tests/fields/` (5,674, 19 files)                                    | Pure unit tests with no database. Five `parse-fields*` files each redefine `fakeCtx` and `field`. `builder.ts` has 65% line coverage and `rich-text/extensions.ts` 72%.                                                                                                                                                                |
| `src/services/` (485)         | `tests/services/` (539, 4 files)                                     | Good. Its types are partly tested with `expectTypeOf`.                                                                                                                                                                                                                                                                                 |
| `src/globals/` (1,321)        | `tests/globals/` (1,832, 12 files)                                   | Fixture: `globals/globals-config.ts`.                                                                                                                                                                                                                                                                                                  |
| `src/media/` (1,857)          | `tests/media/` (3,275, 18 files)                                     | `methods/delete.ts` (storage cleanup) has no test. `serving/handler.ts` has 80% line coverage.                                                                                                                                                                                                                                         |
| `src/users/` (843)            | `tests/users/` (1,762, 13 files)                                     | `password-reset` is an HTTP auth flow test.                                                                                                                                                                                                                                                                                            |
| `src/storage/` (669)          | `tests/storage/` (1,158, 4 files)                                    | No shared driver contract. The R2 tests run against a 150-line hand-written bucket fake.                                                                                                                                                                                                                                               |

## Findings

Ranked by the cost of leaving each one. Each finding gives the principle numbers,
a location, a category and a fix.

### 1. The harness is a partial copy of boot and of the libsql driver (P20, P9, P24, P12). WRONG-LEVEL and INCONSISTENT

- `_support/harness.ts:71-108` (`buildTestDb`) builds its own `Kysely` with
  `LibsqlDialect`, and its own driver object with `supportsTransactions: true`. It does
  not use `libsql({ url })` from `src/database/drivers/libsql.ts`, which is what a site
  runs. As a result:
    - the production driver's dialect choice, remote adapter and `isRemote` wiring never
      run under the suite (27.6% line coverage);
    - the harness and the driver can disagree without any test failing;
    - the same `new Kysely` plus `client as never` construction appears 8 more times in
      `tests/database/*.test.ts`.
- `setupTestConfig` (`harness.ts:224-232`) does `setConfig` and `registerPlugins`, but
  boot (`src/astromech.ts:122-139`) also registers storage, image config, email and AI.
  So **18 test files call `setStorageDriver` by hand** (for example
  `media/service.test.ts:91` and `content/resource-conformance.test.ts`), and
  `media/serving/handler.test.ts:149` calls `setImageConfig` by hand.
- With `isolate: false`, a file that forgets one of these setters inherits the
  previous file's driver in that worker. That makes the suite depend on file order
  (P24).

**Fix:**

1. Extract `registerBackends(config)` from `src/astromech.ts:122-139` (database,
   storage, image, email, scheduler), and have boot and `setupTestConfig` both call it.
2. Have `createTestDb` call `libsql({ url }).getInstance()` and register that driver.
3. Delete the 18 hand-written `setStorageDriver` calls. Tests that need special
   storage pass it in config.

### 2. Every DB test rebuilds and re-migrates a database (P13, P20, P28). OPTIMISE

- `harness.ts:111-113`: `createTestDb()` runs the whole chain (app plus `redirects`,
  `backups` and `forms` baselines) on a new file, called from `beforeEach` in 67 files
  covering 744 tests.
- Several of those files need little or no schema:
    - `database/create-repository.test.ts:51-58` re-migrates the whole schema per test,
      then creates one probe table;
    - in `database/codec.test.ts`, 3 of the 5 tests are pure functions but still pay
      for the per-test database;
    - `baseline-ddl-parity.test.ts:43-51` builds the same two databases twice.

**Fix:**

1. In `global-setup.ts`, or once per worker, migrate one template file.
2. Make `createTestDb()` copy the template with `fs.copyFileSync` to a new name in
   `testDbDir`. This keeps one file per test, so isolation and the
   connection-pool reasoning in the harness header still hold.
3. Move pure-function tests out of database-backed `describe` blocks.

The runtime agent's per-file timings will size the saving.

### 3. Copy-pasted test suites across the four resources (P2, P15). REDUNDANT and INCONSISTENT

About **158 tests in 21 files** repeat the same scenarios for entries, globals,
media and users, often with identical test names:

| Scenario                     | Files and test counts                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versions                     | `globals/versions` (10), `media/versions` (12), `users/versions` (12), plus `entries/service.test.ts:386-603`                                                                                                    |
| Translation                  | `media/translatable` (11), `users/translatable` (10)                                                                                                                                                             |
| Relationships across locales | `media/relationships` (3), `users/relationships` (4)                                                                                                                                                             |
| Field validation             | `entries/field-validation` (32), `users/` (14), `media/` (9), `globals/` (7). Each re-checks required, default, slug, email and unique-with-self-exclusion, which `fields/parse-fields*.test.ts` already covers. |
| Definition                   | `{entries,globals,media,users}/definition.test.ts` (23)                                                                                                                                                          |
| Atomicity                    | 7 files (12)                                                                                                                                                                                                     |

`content/resource-conformance.test.ts` already holds the cure: an adapter table plus
`describe.each(RESOURCE_TYPES)`.

**Fix:**

1. Grow the adapter (save, update, versions, restore, translate, unique field), and
   move each shared scenario there once.
2. Leave only resource-specific cases in the per-resource files, for example "writes
   no version when only the `users` row changes" and media `replace`.

### 4. Spies on owned modules, including tests of internal structure (P8, P10, P11, P1). WRONG-LEVEL

There are 20 `spyOn` calls on owned code:

- **Fault injection for rollback tests** (7 files): `relationshipRepository.replaceForSource`
  and `deleteByResource` are spied in `entries/create-atomicity.test.ts:22`,
  `restore-atomicity:26`, `staging-atomicity:24`, `duplicate-atomicity:26`,
  `media/atomicity:29` and `users/atomicity:29-37`. `users/atomicity` adds a hidden
  `state.failing` toggle.
- **`entries/service.test.ts:1210-1278`**: seven near-identical tests that stub
  `entryRepository.update`, `.delete`, `.trash.trash` and `.trash.restore`.
- **Tests that pass on code structure, not behaviour** (delete them):
    - `users/last-admin.test.ts:73-82` ("the admin count comes from the user repository");
    - `globals/repository.test.ts:44-55` ("the exported repository is the one the
      service reads through");
    - `media/used-by.test.ts:235-242` ("the file-row read comes from the media
      repository").
- **`entries/repository/maintenance.test.ts:235-251`** spies `purgeTrashedBefore`
  to capture a cutoff, then asserts it within ±60 s of the wall clock.
- **`content/dangling-relations.test.ts:270-289`** asserts on the calls made to
  `resourceExistenceRepository.findIds`. Keep it only if one query per kind is a
  stated performance contract, and name it as one.

**Fix:**

- Inject faults at the database instead of in owned code. Use a real trigger on the
  per-test file:
  `CREATE TRIGGER fail BEFORE INSERT ON relationships BEGIN SELECT RAISE(ABORT,'boom'); END`.
  Add it to `_support` as `failWritesTo(db, table)`. Do not use a `TEMP` trigger,
  because the connection pool would only see it on one connection.
- For the purge job, use `vi.setSystemTime` with real trashed rows on both sides of
  the cutoff.
- Fold the seven single-id tests into one `it.each` that uses the trigger.

### 5. Seven atomicity files each build their own database setup (P20, P15). INCONSISTENT and AI-FRIENDLINESS

- **Hand-made database files.** `entries/create-atomicity.test.ts:30-49`,
  `staging.test.ts:37-61`, `staging-atomicity`, `duplicate-atomicity`,
  `restore-atomicity`, `media/atomicity` and `users/atomicity` all use
  `createFileTestDb` with `os.tmpdir()` plus `process.pid` plus a counter. They also
  delete the `-wal` and `-shm` files in `afterEach`.
- **Leftovers on crash.** These files sit outside the per-run directory, so a crashed
  run leaves them behind.
- **Split setup.** Several of these files split `beforeEach` in two, with a `const`
  between the halves (`create-atomicity.test.ts:22-39`).
- **Already solved.** `createTestDb()` is already file-based and cleaned up by
  `global-setup.ts`. Its only other caller is
  `transport/http/routes/entries-staging.test.ts`.

**Fix:** use `createTestDb()` in these files and delete `createFileTestDb` from the
harness.

### 6. Writes checked with raw SQL instead of the public read path (P14). WRONG-LEVEL

There are 88 raw reads in scope. Most in `database/` are justified: migration, DDL,
codec storage format and plugin-purge tests.

Outside `database/`, these could read through the service instead:

| Location                                            | Raw read                               | Public read to use                                                                                                    |
| --------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `entries/service.test.ts:803-809`                   | trash, by decoding a raw `entries` row | `query({ full: true, trashed: true })`                                                                                |
| `entries/service.test.ts:847`                       | `emptyTrash`                           | `query({ full: true, trashed: true })` and a `full` query                                                             |
| `entries/service.test.ts:1084-1113` and `1126-1131` | relationship index rows                | `usedBy` on the target, which already returns `schemaPath`, `instancePath` and `sourceKind` (see `:1134`)             |
| `globals/service.test.ts:81`                        | global rows after an update            | `get`                                                                                                                 |
| `entries/repository/entries-table.test.ts:60-76`    | the entry and content rows             | none: this test checks how the rows are split (P4), which the snapshot drift test and the service tests already cover |

**Fix:** keep raw SQL only where the point is that nothing was written (delete, a
blocked hook) and in migration and storage-format tests. Use the service or `usedBy`
everywhere else.

### 7. Untested behaviour and assertions that cannot fail (P29, P3). WEAK

- **`media.delete` has no storage test.** `src/media/methods/delete.ts` removes the
  original and every variant from storage, but no test checks that. The only test of
  the method (`transport/http/routes/media-contract.test.ts:300`) checks that the row
  is gone. There is also no test for what happens when the storage delete throws
  after the database read.
- **The production libsql driver** is 27.6% covered by core's suite. Dump and restore
  are only covered by `plugins/backups/tests/backups.test.ts`.
- **`database/cron-table.test.ts:10-17`** ("is created by the package migrations")
  can only fail if the harness breaks, which the testing skill itself calls out. Its
  round-trip test repeats `create-repository.test.ts:85-101`.
- **`content/repository-surface.test.ts`** (the whole file) checks method names on
  repositories, which `tsc` already proves (P3, P1). Delete it.
- **In `content/shared-helpers.test.ts`**:
    - `:107-117` ("propagates nothing without a propagator") asserts only that the call
      resolves to `undefined`;
    - `:63` asserts `typeof name() === 'string'`;
    - `:66-73` computes its own expected value (P16).

    The file is a coverage filler across six private helpers, built on inline fakes
    (`:99`, `:204-221`) that have no tests of their own (P4, P9).

- **`database/drivers/database-transaction-degrade.test.ts:44-53`** asserts
  `toBeDefined` and "not the base handle", which checks how the code is built. Test
  the behaviour: a throw inside `transaction()` rolls back the write on libsql, and
  does not roll it back on a no-transaction driver.
- **`database/column-formats.test.ts:31-34`** asserts only `typeof … 'string'`. Fake
  `Date` and assert the ISO value.

### 8. Casts used to forge users and fields (P19). AI-FRIENDLINESS

- **Forged users.** `{ id: author.id } as never` stands in for a `User` 12 times
  (`globals/service.test.ts:94,100`, `media/definition.test.ts:79,91,114,121`,
  `users/definition`, `entries/definition`, `entries/staging.test.ts:220`,
  `globals/staging`). The reason is that `createTestUser` returns `UserTableRow`, not
  `User`. The same gap explains `entries/authorship.test.ts:35,39`
  (`as unknown as User`) and `_support/mount-router.ts:27`.
- **Forged fields.** Five `fields/parse-fields*.test.ts` files define
  `field(def) { return def as Field }`. The builder casts, so it checks nothing.
- **Libsql client casts.** `client as never` for the libsql client appears 8 times.

**Fix:**

1. Have `createTestUser` return the decoded `User` (read it back through the users
   repository), and make `runAsUser` and `contextAs` accept it.
2. Replace the local `field()` helpers with the typed factories in
   `src/fields/builder.ts`.
3. Put the libsql cast in one harness helper.

### 9. Unexpected console output is silenced, not failed (P26). WEAK

- **No guard.** `vitest.config.ts` has no `setupFiles` or `onConsoleLog`, so an
  unexpected `console.error` passes silently.
- **Silenced without checking.** Nine tests mute `console.error`. Two of them never
  assert on it: `entries/service.test.ts:1408` and
  `content/jobs/scheduled-publish.test.ts:149`.
- **Source of the problem.** Product code logs through `console.error` directly, so a
  test cannot inject a logger.

**Fix:**

1. Add a setup file that fails a test on any `console.error` or `console.warn` it did
   not declare.
2. Add an `expectConsoleError(pattern)` helper for tests that expect output.
3. Over time, route job and hook errors through `@/utilities/log` so tests can
   capture them without spies.

### 10. Hand-written storage fakes, none checked against a real driver (P7, P9). REDUNDANT

Every fake below is in scope, and none has a test of its own:

| Fake                    | Location                                     |
| ----------------------- | -------------------------------------------- |
| `makeMemoryStorage`     | `media/serving/handler.test.ts:53`           |
| `makeStorage`           | `media/access.test.ts:26`                    |
| `makeTrackingStorage`   | `media/service.test.ts:20`                   |
| `makeTrackingStorage`   | `media/field-validation.test.ts:18`          |
| a copy of `noopStorage` | `entries/entries-capabilities.test.ts:25-41` |
| `makePagedDriver`       | `storage/prefix.test.ts:8`                   |
| fake R2 bucket          | `storage/drivers/r2.test.ts:11-165`          |

Outside this scope, another 10 files define their own `StorageDriver`.

- **Duplicated stream draining.** The code that drains a stream is copied 5 times
  (`media/service:29`, `media/field-validation:28`, `handler:63`, `s3:33`, `r2:46`).
  `new Response(stream).arrayBuffer()` does the same in one line.
- **Reaching into a fake's internals.** `handler.test.ts:257-259` reads the fake's
  private `_store`, when `storage.get(key)` would do.

**Fix:**

1. Use the real `filesystem` driver, rooted in a per-test directory under
   `testDbDir`, wherever a test needs bytes back.
2. Keep one `memoryStorage()` in `_support/fixtures.ts`.
3. Add one `describe.each` StorageDriver contract test (put, get, range, stat, list
   with a cursor, delete) that runs against filesystem, memory and the R2 fake.
   Run it against S3 with stubbed `fetch`, and against real R2 through
   `getPlatformProxy` in the slow tier.

### Lower-cost findings

- **Three ways to register hooks** (INCONSISTENT, P15):
    - `setupTestConfig({ ...cfg, plugins })` in `globals/plugin-namespaced`;
    - `setupTestConfig()` then `registerTestPlugins` inline 9 times in `entries/service.test.ts:1280-1521`;
    - a local `probe(hooks)` helper in `globals/hooks.test.ts:24` and `content/jobs/scheduled-publish.test.ts:22`.

    `registerTestPlugins` is a thin alias of `registerPlugins`. Fix: add one harness
    helper, `withHooks(hooks, config?)`, and delete `registerTestPlugins`.

- **Config mutation against named fixtures** (INCONSISTENT): entries tests change
  `makeTestConfig()` in place 6 times
  (`if (cfg.entries.post) cfg.entries.post.staging = true` in `entries/staging.test.ts:48-49`,
  `preview.test.ts:26`, `authorship.test.ts:30`, `service.test.ts:925`), while
  globals, media and users use named configs (`globals-config.ts`). Fix: add a
  `stagedPost` type, or `makeTestConfig({ staging: true })`.
- **Feature configs imported across directories by relative path** (P15):
  `content/jobs/scheduled-publish.test.ts:14` and
  `transport/http/routes/globals-app.ts:16` import `../../globals/globals-config`, and
  `globals/hooks.test.ts:14` imports `../transport/http/routes/globals-app`. Fix: move
  the `*-config.ts` files to `_support/` and import them through `@tests/`.
- **Admin role defined locally** in 4 `definition.test.ts` files instead of the
  `adminRole` fixture. `entries/entries-capabilities.test.ts:17-82` rebuilds the
  harness's `noopDriver` and `noopStorage`.
- **Repository tests repeat service tests** (REDUNDANT, P2, P4).
  `entries/repository/entries-table.test.ts` (748 lines) repeats slug uniquification
  (`:196`), trash hiding every locale (`:496`), per-locale version sequences (`:556`)
  and search, sort and pagination (`:215-395`), all already in
  `entries/service.test.ts`. `service.test.ts:605-619` repeats
  `entries-capabilities.test.ts:171-184`. `codec.test.ts:76-82` repeats
  `column-formats.test.ts:37-40`. `drift.test.ts` and `baseline-ddl-parity.test.ts`
  both call themselves "the drift gate".
- **Test names** (P2): fields uses arrow names ("empty + required → error", 83
  times), and media uses arrow names (17), 8 of them numbered
  (`media/serving/handler.test.ts`, "6. valid variant cache hit → 200"). The house
  skill bans numbering.
- **Stale or misleading text**:
    - the `entries/entries-capabilities.test.ts:6` header says versions "returns [] …
      (lenient)", but the tests assert `CapabilityError`;
    - `entries/service.test.ts:25-27` aliases the service twice (`entriesService`, then
      `api`).
- **Logic in tests that the types make unnecessary**: `entries/patch-update.test.ts:77-79`
  `one()` unwraps `Entry | Entry[]` 11 times, but the `update({ id })` overload
  already returns `Entry` (`src/types/typed-entries.ts:132-167`).
  `entries/visibility.test.ts` has 10 `if (!result) return;` guards that would pass
  silently if the `expect` above them were deleted.
- **A workaround that hides a design question** (P10):
  `entries/write-policy.test.ts:27-30` wraps calls in `attempt()` because the scoped
  handle refuses synchronously, and `services/define-service.test.ts:137,176` asserts
  a synchronous throw from an async method. A bound method should reject, not throw.
  Raise this as a src question.
- **Wall-clock tolerances** (P25): `entries/service.test.ts:755-759`,
  `globals/status.test.ts:36,49-50` and `maintenance.test.ts:250`. Use
  `vi.setSystemTime`.
- **Misfiled tests** (mirroring rule): `entries/visibility.test.ts` belongs in
  `content/`, and `database/plugin-purge.test.ts` in `transport/cli/`.
- **Giant files** (AI-friendliness): `entries/service.test.ts` (1,521 lines) mixes
  CRUD, versioning, translation, publish, trash, duplicate, relationships, bulk,
  error unwrapping and hooks. Split by behaviour, as `globals/` already is
  (`versions`, `hooks`, `status`, `staging`).
- **Duplicated JPEG bytes**: the byte array is in
  `media/serving/handler.test.ts:12-51`, `media/service.test.ts:10-16` and three
  other files. Move it to one fixture.
- **No property-based tests** (P31) where they would pay most:
    - the where DSL (`database/create-repository.test.ts`, 76 tests);
    - `fields/field-path.test.ts` (it already loops over valid and invalid lists at
      `:32-50`);
    - rich-text safe links;
    - slug uniquification.
- **Thin type tests** (P6): 8 `expectTypeOf` in scope. Nothing checks the
  `typed-entries` overloads, `Where<T>` or `defineTable` inference, which are public
  API.
- **Auth uses full password-hashing cost** (P28): `_support/auth.ts` and
  `users/password-reset` use better-auth's default scrypt cost with no test-mode
  setting. The cost is small today (a handful of tests).
- **Copy-and-delete global registries** (P23): `delete globalThis.__astromech?.auth`
  appears in 3 files in scope, and module registries are reset by convention. This
  is the WordPress warning case. It needs a design change in src (per-instance
  registries), not only a test fix.

## Patterns to keep as the model

- **Real database, no module mocks.** Every in-scope test runs on real SQLite through
  the committed migration chain, with **0 `vi.mock`, 0 `as any`, 0 snapshots,
  0 `.skip`/`.only`, 0 `setTimeout` and 0 "should" names** in 1,574 tests. This
  matches course-video-manager and Payload.
- **`content/resource-conformance.test.ts`**: one `describe.each(RESOURCE_TYPES)` over
  an adapter table, so that "how each resource is called" is the only difference.
  Grow it (finding 3).
- **`database/create-repository.test.ts`**: a throwaway probe table local to the file
  ("so the generic wrapper's tests do not move whenever a real table's shape does"),
  with assertions on decoded stored rows.
- **`services/strict-input.test.ts`**: a sweep over every method input. It has a guard
  against passing on nothing (`toBeGreaterThan(40)`) and a test of the checker itself
  (`:49-60`). `isolation-list.test.ts` follows the same idea, with a list that
  cannot drift.
- **Fakes at the process edge**:
    - `users/password-reset.test.ts` captures email and asserts on the message sent;
    - `storage/drivers/s3.test.ts` stubs `fetch` and asserts on the signed `Request`;
    - `globals/hooks.test.ts` fires hooks through the real plugin runtime.
- **Fake only `Date`** (`vi.useFakeTimers({ toFake: ['Date'] })`, 13 sites) with
  explicit `setSystemTime` values.
- **Headers that explain why**: `codec.test.ts`, `column-formats.test.ts` and
  `foreign-key-check.test.ts` say why they go down to the stored cell. `CHARACTERIZED:`
  comments mark surprising behaviour in `entries/service.test.ts`.
- **Labelled assertions in loops**: `expect(x, label)` in
  `fields/core-field-types.test.ts` and `media/definition.test.ts`.
- **Typed builders with defaults**: `publishedEntry(overrides)` in
  `entries/visibility.test.ts:18`. `createTestUser` throws on failure (P21).
- **`restoreMocks: true`** in config, so spies cannot leak between files under
  `isolate: false`.

## Principles that look wrong or incomplete for this codebase

- **P6 (`*.test-d.ts`)**: `tsc -p tsconfig.test.json` already type-checks `tests/**`,
  so `expectTypeOf` inside a `.test.ts` is enforced as it stands. Keep "test the public
  types" and drop the file-suffix rule, unless the plan is Vitest's `typecheck` mode.
- **P13 (truncate and re-seed)**: on SQLite, the cheapest correct reset is to copy a
  file that was migrated once. That keeps a fresh database per test, real commits and
  real connections. The principle should name this option.
- **P14 (no raw SQL)**: it needs an explicit exemption for migration, DDL-parity and
  storage-format tests. In those, the stored cell is the behaviour, for example
  better-auth's ISO timestamps in `codec.test.ts`.
- **P8 (never mock owned code)**: this is right, but it should name fault injection
  for rollback tests and give the alternative (a database trigger). Otherwise the 7
  atomicity files read as a justified exception and agents will copy them.
- **P3's example of "a route that only calls a service"** conflicts with the house rule
  that a route change is tested through the real router. Here routes parse and
  serialise, so they are not thin.
- **P23 (instance registries)**: the architecture uses module-level registries on
  purpose (`setConfig`, `setDb`, `setStorageDriver`, the memoised `getAuth`). Until
  src changes, the usable form of this rule is "one harness function resets every
  registry, the same way boot sets them" (finding 1).
