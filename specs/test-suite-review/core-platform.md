# Core platform tests: audit against `roadmap/planned/test-suite-review.md`

Scope: `packages/astromech/tests/` directories transport, auth, permissions,
policies, plugins, config, codegen, integrations, ai, cron, notifications,
request-scope, app-context, errors, exports, utilities, and the top-level files
(`astromech.test.ts`, `registry.test.ts`, `env.test.ts`,
`isolation-list.test.ts`). `_support/` read for context only.

Read in full (29): scoped-tools, policy-parity, request-scope, session,
rpc-parity (first half), cron/runner, codegen/method-manifest,
permissions/permissions, entry-permission, global-permission (part),
utilities/permission-match (part), policies/scoped-services, app-context,
notifications/notify, cli/commands, plugin-runtime, define-plugin,
define-config, exports/shared-browser, env, isolation-list, astromech, registry,
auth/database, first-admin (part), ai/model-access, astro/middleware,
cron/drivers, scheduled-handler (setup), dispatch (most), mcp/server,
utilities/values-equal, labels, type-generator-golden, d1-local-emulation
(setup), entries-crud (first third), openapi-document (structure), client/methods
(setup). Skimmed names and setup for the rest.

## Counts (128 files, 127 test files, 24,313 lines, ~1,350 tests)

| Pattern                                         | Count             | Files                                                                                                                           |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `vi.mock(`                                      | 18                | 13                                                                                                                              |
| ...of which mock an owned module                | 16                | 11 (`virtual:astromech/config` and `@/transport/cli/prompt` are the only boundary mocks)                                        |
| ...`@/auth/session`                             | 6                 | 6 (plus `users/role-validation`, outside scope)                                                                                 |
| ...`@/app-context/services` (partial)           | 3                 | call-method, dispatch, mcp/parity                                                                                               |
| `vi.fn(`                                        | 32                | 16                                                                                                                              |
| `vi.spyOn(`                                     | 28                | 12 (18 on `console`/`process`, 10 on owned code: repositories, `createServices(ctx).users`, `entriesDefinition…handler`, `log`) |
| `toHaveBeenCalled*`                             | 55                | 18 (12 in scoped-services alone)                                                                                                |
| `as any`                                        | 1                 | 1 (a test name, not a cast)                                                                                                     |
| `as unknown as`                                 | 62                | 34                                                                                                                              |
| `as never`                                      | 22                | 13                                                                                                                              |
| `as unknown as ResolvedConfig` (partial config) | 16                | 8                                                                                                                               |
| `as User` (partial user)                        | 13                | 11                                                                                                                              |
| real `setTimeout`                               | 1                 | auth/database.test.ts:48                                                                                                        |
| snapshots                                       | 1 (139-line file) | codegen/type-generator-golden                                                                                                   |
| `.skip` / `.only` / `.todo`                     | 0                 | 0                                                                                                                               |
| `it('should …')`                                | 59                | 4 (42 in method-manifest)                                                                                                       |
| numbered names (`'1. …'`)                       | 12                | cron/runner                                                                                                                     |
| `expectTypeOf` / `@ts-expect-error`             | 4 / 4             | define-plugin, permissions                                                                                                      |
| `*.test-d.ts`                                   | 0                 | 0                                                                                                                               |
| `createTestDb()`                                | 60                | 58; ~620 tests run the full migration chain in `beforeEach`                                                                     |
| `beforeAll`                                     | 8                 | 4                                                                                                                               |
| `globalThis.__astromech` writes                 | 40                | 16                                                                                                                              |
| files in `isolatedTests` from this scope        | 30 of 33          |                                                                                                                                 |
| `expect.unreachable` try/catch                  | 15                | 5 (11 in scoped-services)                                                                                                       |
| `.not.toThrow()`                                | 27                | 11 (most are legitimate "allows X" cases for validators)                                                                        |
| files over 400 lines                            | 13                | largest openapi-document 788, client/methods 676, scoped-services 673, resolve 647, method-manifest 635                         |
| files with a header comment                     | 97 of 128         |                                                                                                                                 |

## Findings, ranked by cost of leaving them

### 1. Two tests pin contradictory publish gates; the catalogue omits a permission a method needs

- Principles 1, 9 (no contract test between two derived lists), 29.
- Category: WEAK (missing cross-check) and a live defect the tests enforce.
- `tests/permissions/permissions.test.ts:374` "omits publish for a type without
  versioning" and `:402` "omits publish for a global without versioning" pin
  `src/permissions/catalogue.ts:34-61`, which gates `publish` on `versioning`.
- `tests/codegen/method-manifest.test.ts:334` "should emit entries.publish for
  non-versioned type pages too" pins the manifest, which gates publish on
  `statuses` (`src/entries/methods/publish.ts:25`, `src/globals/methods/publish.ts:17`).
- Result: a type or global with `versioning: false` and statuses on exposes
  `entries.publish` / `globals.publish` requiring `entry:pages:publish` /
  `global:footer:publish`, but the admin role editor and `astromech permissions`
  (both read the catalogue) never offer that grant. The catalogue's own comment
  ("the same gate `buildEntriesMethods` applies") is stale, as is
  `src/codegen/method-manifest.ts:145`.
- Fix: add one property test: for the representative config plus a plugin,
  every non-dynamic `permission` in `generateMethodManifest()` appears in
  `buildPermissionCatalogue()`. It fails today. Then change the catalogue to gate
  `publish` on `statuses` and flip the two tests. Write the failing test first
  (principle 5).

### 2. The session mock is no longer needed in five of six files

- Principles 7, 8, 10. Category: WRONG-LEVEL, OPTIMISE (each mock forces per-file isolation).
- `vi.mock('@/auth/session')` in `transport/policy-parity.test.ts:39`,
  `transport/http/routes/rpc-parity.test.ts:33`, `app-root.test.ts:21`,
  `cron.test.ts:25`, `plugins-contract.test.ts:24`, and
  `request-scope/request-scope.test.ts:20`. Four files each hand-write their own
  `signIn()` around it.
- Why it is no longer justified: `createHttpApp` joins an open request scope
  when `open.request === c.req.raw` (`src/transport/http/app.ts:55-63`), and a
  scope seeded with `user` and `role` never resolves a session
  (`src/request-scope/request-scope.ts:61`). `cron.test.ts:34` already wraps its
  own app in `runInRequestScope`; it could seed the identity there.
  `@tests/auth`'s `signInTestUser` gives a real Better Auth session for the cases
  that need the cookie path.
- Fix: add `requestAs(app, { user, role }, path, init)` to `_support` that builds
  the `Request`, seeds the scope and calls `app.fetch(req)`. Replace the mock and
  the four `signIn` helpers. Keep the mock only in `request-scope.test.ts`, where
  "no session resolve happened" is the behaviour under test. Five files leave
  `isolatedTests`.

### 3. Mocks and spies of owned modules that assert wiring rather than outcomes

- Principles 1, 8, 10, 11. Category: WRONG-LEVEL.
- `transport/tools/scoped-tools.test.ts:15-18` mocks four owned modules
  (`manifest-registry`, `method-filter`, `annotate-manifest`, `dispatch`) to test
  a 25-line composition, and asserts on `mock.calls[0][1]` (lines 110, 125, 131,
  171-172). It would fail on any refactor of the call order and passes even if
  the real filter and annotation disagree.
  Fix: `setMethodManifest(generateMethodManifest(resolveConfig(makeTestConfig())))`,
  build tools for `roleWith([...])`, assert the returned tool ids. The four
  mocks, `vi.clearAllMocks()` and the isolation entry go.
- `transport/tools/dispatch.test.ts:29` partially mocks `@/app-context/services`
  and then `Object.assign(createServices(ctx), { users: usersService })` (line
  140), which relies on `createServices` memoising and on the scoped handle
  reading the trusted handle lazily. Same partial mock in
  `policies/call-method.test.ts:36` and `transport/mcp/parity.test.ts:32`.
  Fix: use the real services on a test DB. Show "refused before the service ran"
  through state: a refused `users.create` leaves no row; an allowed
  `users.query` returns the seeded user.
- `plugins/runtime/plugin-runtime.test.ts:31` mocks `@/transport/tools/scoped-tools`
  for one test (line 199, `toHaveBeenCalledWith`), which isolates the whole
  417-line file. Fix: set a real manifest and assert `ctx.methods.tools()` ids.
- `transport/cli/commands.test.ts:29-39` mocks `@/config/load` and `@/astromech`
  (the boot). The `prompt` mock is a fair TTY boundary. Fix (principle 10): let
  the command runner take the loaded app as a parameter, or point
  `loadConfigFile` at a fixture config file over the test DB.
- Spies on owned code: `cron/runner.test.ts:488-492` (three repository methods),
  `notifications/notify.test.ts:124` (`notificationRepository.delete`; redundant
  with the state test at line 110, delete it), `app-context/app-context.test.ts:115,130`
  (`createServices(ctx).users.get`), `transport/http/routes/users-contract.test.ts:152`,
  `field-validation-status.test.ts:291`, `plugins/runtime/plugin-tracking.test.ts:144`.
  The last three inject a failure that is hard to cause for real; keep them but
  say so in a comment. The others assert wiring.

### 4. Global registries reset by hand, in different ways per file

- Principles 20, 23, 24. Category: INCONSISTENT, AI-FRIENDLINESS.
- 16 files write `globalThis.__astromech`. `cron/runner.test.ts:35-49`,
  `cron/scheduled-handler.test.ts:27-58` and `plugin-runtime.test.ts:109-114` each
  carry their own 4-7 line reset block (cron jobs, tick flag, warned set,
  interval, scheduler, plugin runtime, email), runner and scheduled-handler both
  before and after. `auth/session`, `auth/database`, `auth/first-admin` delete
  `__astromech.auth` because `getAuth()` caches the first DB it sees.
  `registry.test.ts:7` wipes the whole namespace although its registries use
  unique names (only the last test needs the wipe).
- An agent adding a registry slot will not know which of these lists to extend,
  and a missed slot leaks across files under `isolate: false`.
- Fix now: one `resetRuntime()` in `_support/harness.ts`, called by
  `createTestDb()` or a single `setupFiles` entry. Fix later (principle 23): move
  cron jobs, the plugin runtime and the auth instance onto the app instance so a
  test builds one and needs no reset.

### 5. Every DB test migrates a fresh database

- Principles 13, 20, 28. Category: OPTIMISE. (Measurement belongs to the timing agent.)
- About 620 tests in 58 files call `createTestDb()` in `beforeEach`, which runs
  the app chain plus three plugin chains (`_support/harness.ts:73-104`).
- Clear waste in scope: `transport/http/routes/openapi-document.test.ts:92-95`
  migrates a DB for 42 tests, but `document()` (line 68) only composes routers
  and `servedDocument` only builds the app. Use `beforeAll` or drop the DB.
- General fix: migrate one template file per worker, then copy it per test
  (file copy is far cheaper than a migration run); keep `createTestDb()` as the
  API.

### 6. Partial objects cast into place

- Principles 15, 19. Category: AI-FRIENDLINESS.
- 16 `as unknown as ResolvedConfig` in 8 files: `codegen/type-generator-{tree,public,globals,golden}`,
  `plugins/runtime/plugin-fields.test.ts` (6), `config/content-locale.test.ts:11`,
  `transport/http/client-address.test.ts:27,32`. `plugin-runtime.test.ts:35-86`
  hand-writes a 50-line `ResolvedConfig` that skips `resolveConfig` and will
  drift from it.
- 13 `as User` in 11 files; `_support/mount-router.ts:27` itself is
  `{ id, email } as unknown as User`.
- `cron/runner.test.ts` has 9 `as unknown as Updateable<…>`; `scoped-services.test.ts:236-248`
  casts through `Record<string, never>`.
- Fix: typed builders in `_support`: `resolvedConfig(overrides)` that runs
  `resolveConfig({ ...makeTestConfig(), ...overrides })`, and
  `buildUser(overrides): User` with every field filled. Agents copy what they see.

### 7. The public `define*` API has almost no type tests

- Principle 6. Category: WEAK.
- Only `plugins/define-plugin.test.ts:86-102` (4 `expectTypeOf`, 3
  `@ts-expect-error`) and `permissions/permissions.test.ts:240` check types.
- `src/plugins/define-service-method.ts` is nothing but type overloads (input,
  output, `PluginContext` inference) and has no test of any kind.
- `defineHook` infers the payload from the event key; `plugin-runtime.test.ts`
  annotates `(payload: unknown)` and `{} as EntryCreateContext`, which defeats
  the inference it should prove.
- `config/define-config.test.ts` tests `defineConfig` at runtime as an identity
  function (principle 3); its value is contextual typing, which is untested.
- No type tests for `defineGlobal`, `defineEntryType`, `defineAdminPage`,
  `defineAdminResource`, `definePluginTable`, `definePermissions` key literals.
- `tsconfig.test.json` type-checks `tests/**`, so inline `expectTypeOf` already
  runs under `pnpm typecheck`; a `.test-d.ts` file is optional.
- Fix: one type test per exported `define*`: inferred handler argument, a
  rejected wrong key (`@ts-expect-error`), and the returned type. Delete the
  runtime `defineConfig` test.

### 8. `codegen/method-manifest.test.ts`: one property per test, types discarded

- Principles 2, 3, 16, 17, 19. Category: REDUNDANT, AI-FRIENDLINESS.
- 42 of 59 `should` names are here. About 40 tests each regenerate the manifest
  and check one field (`source`, `permission`, `mutates`...).
- `parseManifest()` (line 108) casts the typed `MethodManifest` to
  `Record<string, unknown>[]`, so every assertion indexes with strings and the
  type checker cannot help.
- Tests that cannot fail meaningfully: line 122 (`JSON.parse` does not throw),
  132 (`Array.isArray`), 361 (a key "removed in manifest v2" is absent).
- Fix: generate once per file, keep the typed union, and replace the per-field
  tests with an `it.each` table of `{ id, typeId, permission, mutates,
destructive, idempotent }` asserted with `toMatchObject`. Keep the
  every-method property tests (lines 193, 202, 366, 596): they are the useful
  part.

### 9. `cron/runner.test.ts` reads as a log of a refactor

- Principles 2, 11, 14, 15, 16. Category: AI-FRIENDLINESS, INCONSISTENT.
- Numbered names out of order (`'9.'` follows `'11.'`), several behaviours per
  test (line 52), nine copies of a 10-line raw SQL update with an
  `as unknown as Updateable` cast, `(await import('@/database/registry')).getDb()`
  eight times instead of the handle `createTestDb()` returns, test 6 (line 257)
  sets the private `cronTickRunning` flag, test 12 spies on three repository
  methods, tests 4 and 11 compute the expected instant with Croner (the library
  under the code) instead of hard-coding `2024-06-02T00:00:00Z`, and a manual
  `mockRestore()` that `restoreMocks: true` already does.
- Fix: `setCronRow(db, name, patch)` helper, outcome names
  ("skips a job whose lock has not expired"), hard-coded instants, and drive the
  overlap guard through two real concurrent `onTick` calls.

### 10. The same fixture written many ways

- Principles 2, 13, 15, 20. Category: INCONSISTENT.
- Own no-op `StorageDriver`: 9 files (`@tests/fixtures` has `noopStorage`). Own
  `DatabaseDriver`: 7. Own `Role` literals: 12 (`roleWith` exists).
- Four `signIn` helpers (finding 2); two `inbox()` helpers
  (`notifications/notify.test.ts:35`, `definition.test.ts:21`).
- 10 files call `vi.restoreAllMocks()`/`clearAllMocks()` although
  `vitest.config.ts` sets `restoreMocks: true`.
- Reset after (`env.test.ts:6`, `astro/middleware.test.ts:50`) versus reset
  before everywhere else.
- `utilities/permission-match.test.ts:7-60` uses the retired grammar
  (`entry:read:posts`, action in the middle); `permissions.test.ts:23` says the
  grammar is action-last. An agent copying the first writes wrong permission
  strings. `hasPermission` is tested in three files.
- `transport/http/routes/globals-app.ts` is a helper living outside `_support`.

## Further findings

| #   | File:line                                                                                                                                            | Principle | Category        | Fix                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | `auth/database.test.ts:47-73`                                                                                                                        | 25        | WEAK            | `wait(50)` decides whether the reset request reached the lock before the commit. Under load the commit can win and the test passes without proving the wait. Wait for a positive signal (e.g. poll until the reset's user lookup has run) before committing.                                                                                             |
| 12  | `app-context/app-context.test.ts:155-164, 200-214`                                                                                                   | 1, 3      | WRONG-LEVEL     | The exact key list and "binds services once" are structure. Move the key list to a type test on `PluginContext`; keep "one context per request" (line 76), which has a visible effect.                                                                                                                                                                   |
| 13  | `policies/scoped-services.test.ts` (673 lines)                                                                                                       | 2, 15     | AI-FRIENDLINESS | Three modules in one file (scopeMethods, the scoped handle, `annotateManifest`). Split; `annotateManifest` tests go to `policies/annotate-manifest.test.ts`. Replace 11 try/catch + `expect.unreachable` blocks with a `thrown(fn)` helper and `toMatchObject({ permission })`.                                                                          |
| 14  | `transport/http/client/methods.test.ts`                                                                                                              | 7         | WRONG-LEVEL     | 40+ hand-written expected URLs duplicate `http-routes.ts`. Route the `fetch` stub into `createHttpApp` (`(url, init) => requestAs(app, admin, url, init)`) so the test is a real client-server round trip.                                                                                                                                               |
| 15  | `transport/http/routes/*`                                                                                                                            | 3         | REDUNDANT       | 42 tests named "403s…" and 22 "409s…" across 17 files. The mapping is generic (scoped handle, then `onError`). One table-driven test over `HTTP_ROUTES` (as `openapi-document.test.ts` does) covers it; keep per-route cases for bespoke rows only.                                                                                                      |
| 16  | `codegen/type-generator-golden.test.ts` + 139-line `.snap`                                                                                           | 18        | REDUNDANT       | Frozen "on the P1a descriptor-registry commit … before P1b" (phase markers). The migration has shipped; the focused tree/public tests cover the shapes. Delete, or shrink to inline snapshots per field kind.                                                                                                                                            |
| 17  | `cron/drivers/drivers.test.ts:19, 63-79`                                                                                                             | 3         | WEAK            | "has name X" ×3 and "start() does not throw" ×2 cannot fail usefully. Delete.                                                                                                                                                                                                                                                                            |
| 18  | `config/define-config.test.ts`, `mcp/server.test.ts:19`, `astromech.test.ts:98`                                                                      | 3, 17     | WEAK            | Identity function at runtime; "always returns a string" (types prove it); `resolves.toBeDefined()`.                                                                                                                                                                                                                                                      |
| 19  | `utilities/values-equal.ts` vs `utilities/deep-equal.ts`                                                                                             | 31        | WEAK            | Two equality functions with different key-order semantics; `deepEqual` (versioning decisions) has no direct test; `valuesEqual` (uniqueness) treats `{a,b}` and `{b,a}` as different. Test both with fast-check, or merge.                                                                                                                               |
| 20  | `src/transport/http/routes/query-string.ts`                                                                                                          | 31        | WEAK            | Write and read halves with no direct test; a round-trip property test (`fromQueryParams(toQueryParams(x)) == x` for the supported shapes) is the natural fit. Other fast-check candidates: `matchesPermission`, plugin identity derivation (`plugin-identity.test.ts`).                                                                                  |
| 21  | `src/transport/cli/commands/`                                                                                                                        | 29        | WEAK            | 13 modules with no test: `db-generate`, `db-init`, `db-rebaseline`, `db-status`, `generate-manifest`, `generate-types`, `index-rebuild`, `mcp`, `methods`, `permissions`, `plugin-generate`, `validate`, `cli/index.ts`. `src/transport/**` threshold is 65% lines. Priority: `plugin-generate`, `db-rebaseline`, `index-rebuild` (write files or data). |
| 22  | `src/email/**`                                                                                                                                       | 29        | WEAK            | No `tests/email/`; threshold 19% lines, 0% branches. Not in my listed scope; flagging so it has an owner.                                                                                                                                                                                                                                                |
| 23  | `integrations/cloudflare/d1-local-emulation.test.ts`                                                                                                 | 28        | OPTIMISE        | Boots workerd (60 s timeout) and keeps state in `.wrangler/state`, shared across worktrees. Good test; tag it slow so the fast tier skips it.                                                                                                                                                                                                            |
| 24  | `request-scope.test.ts:128`, `method-manifest.test.ts:186, 361`, `entries-mounted.test.ts:264`, `mcp/server.test.ts:10`, `plugin-fields.test.ts:119` | 15        | AI-FRIENDLINESS | History markers ("the old module-level", "this replaces", "removed in manifest v2", "no longer"). State the present behaviour.                                                                                                                                                                                                                           |
| 25  | `request-scope.test.ts:83`                                                                                                                           | 2         | WEAK            | Covers sequential reuse but not the `resolving` promise shared by concurrent readers (`request-scope.ts:61`). Add: two concurrent `getCurrentUser()` calls in one scope resolve once.                                                                                                                                                                    |
| 26  | `vitest.config.ts` (context)                                                                                                                         | 26        | WEAK            | No `setupFiles` and no `onConsoleLog` in core, so an unexpected `console.error` passes silently. Tests that expect one already spy on it, so a fail-on-unexpected-console setup would cost little.                                                                                                                                                       |
| 27  | `cron/scheduled-handler.test.ts:41-48`                                                                                                               | 8, 9      | WRONG-LEVEL     | Hand-fills `globals().astromech` with a fake app. A fake of the app container is the Strapi warning case; boot the real one (as `scheduled-boot.test.ts` does) or share one fixture.                                                                                                                                                                     |

## Patterns worth keeping (model tests)

- `transport/policy-parity.test.ts`: one case runs through every transport
  (REST, RPC, tool loop, trusted, plugin `ctx`) and expects one outcome map.
  Strong behaviour test, failure shows which transport disagrees. Only the
  session mock needs replacing.
- `transport/http/routes/openapi-document.test.ts` and `rpc-parity.test.ts:132`:
  properties over the whole route table or manifest ("every row", "reached or
  refused, no third outcome"). New rows are covered without new tests.
- `exports/shared-browser.test.ts`: real esbuild bundle, and a failure prints the
  import chain to the offending file. Worth its cost (one build per run, in
  `beforeAll`). It is the only test in `tests/exports/`; `check:exports` and
  `check:node-imports` cover the rest of the subpaths, so no more export tests
  are needed.
- `auth/session.test.ts`: real Better Auth session through `signInTestUser`, one
  DB per file with the reason written down.
- `ai/model-access.test.ts`: a hand-written fake at a third-party boundary,
  assertions on output and the log line.
- `integrations/cloudflare/d1-local-emulation.test.ts`: the real engine, boot once
  per file, reset before (drops owned tables up front, with the reason).
- `_support/mount-router.ts` plus route tests like `entries-crud.test.ts`:
  status, envelope and stored state checked through the real router and error
  handler.
- `plugins/runtime/plugin-tracking.test.ts:88`: `vi.useFakeTimers({ toFake: ['Date'] })`
  as the skill describes.
- `config/resolve.test.ts`: behaviour-named validation cases, built from the
  field builders.
- `isolation-list.test.ts`: keeps the isolation list honest automatically.

## Principles that look wrong or need adjusting here

- **Principle 6's `*.test-d.ts` requirement.** `tsconfig.test.json` already
  type-checks `tests/**`, so inline `expectTypeOf` in a `.test.ts` is checked by
  `pnpm typecheck`. Keep the rule ("public `define*` APIs have type tests") and
  drop the file-suffix part, or adopt `.test-d.ts` only if vitest's typecheck
  mode is wanted for reporting.
- **Principle 11 (no call counts) needs the "refused before the service ran"
  case spelled out.** In `scopeMethods` tests the service is a generic test
  input, not an owned module, and "not called" is the security property. Allow
  call assertions on a test-supplied stub passed as an argument; forbid them on
  owned modules reached through `vi.mock`/`spyOn`.
- **Principle 14 (read back through the public path).** `auth/first-admin` and
  `auth/database` count rows in Better Auth's tables, which have no public read
  path in Astromech. The exception should name third-party-owned tables, not
  only "nothing was written".
- **Principle 23 is a design change, not a test rule.** The cron, plugin-runtime
  and auth registries are module-global by design (`globalThis.__astromech`
  survives duplicate bundle chunks, `src/request-scope/request-scope.ts:34`). The
  test-side rule should be "one reset function owns every slot" until the
  design moves.
