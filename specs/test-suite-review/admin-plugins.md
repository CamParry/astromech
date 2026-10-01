# Test audit: admin, plugins, schema-engine

Scope: `packages/admin/tests` (74 files), `packages/plugins/*/tests` (39 test files plus 2 fakes), `packages/schema-engine/tests` (9 files). Yardstick: the 31 principles in `roadmap/planned/test-suite-review.md`, cited as P1 to P31. Read-only audit on 2026-10-01; no tests were run.

Files read fully or in large part (about 45): forms `forms.test.ts`, `rate-limit.test.ts`, `spam.test.ts`, `form-entry-type.test.ts`; backups `backups.test.ts`, `openapi.test.ts`, `strict-input.test.ts`, `optimize-deps.test.ts`; menus `menus.test.ts`; redirects `redirects.test.ts`, `service/redirects.test.ts`, `hooks/slug-change.test.ts`; seo `service/seo.test.ts`, `helpers/section.test.ts`, `utilities/length.test.ts`; assistant `sessions/repository.test.ts`, `sessions/deleted-user.test.ts`, `sessions/fake-sessions.ts`, `loop/fake-approvals.ts`, `service/sessions.test.ts`, `loop/run.test.ts`, `loop/approvals.test.ts`, `routes/chat.test.ts`, `admin/chat-drawer.test.tsx`, `admin/use-chat.test.tsx`; schema-engine `oracle`, `apply`, `diff`, `identifiers`, `render`, `rebaseline`, `_support/tables.ts`; admin `global-edit-page`, `user-edit-page`, `entry-edit-locale-switch`, `media-detail-modal`, `plugin-slot`, `field-error-aria`, `field-wrapper-warning`, `leaf-field-controls`, `container-field-editing`, `use-field-validation`, `entry-mutations`, `use-bulk-delete-media`, `use-media-browser`, `ai-context`, `ai-context-readout`, `field-registry`, `cell-registry`, `register-fields`, `cell-kind-map`, `entry-query-keys`, `global-query-keys`, `media-sort-select`, `vite`, `root-entries-route-redirect`, and `_support/dom-setup.ts`, `_support/isolated-tests.ts`, `_support/admin-config-shim.ts`, plus core's `tests/_support/harness.ts`, `plugin-vitest-config.ts`, `openapi.ts`.

## Counts

| Pattern                         | admin (74) | assistant (12) | backups (4) | forms (9) | menus (3) | redirects (5) | seo (6) | schema-engine (9) |
| ------------------------------- | ---------- | -------------- | ----------- | --------- | --------- | ------------- | ------- | ----------------- |
| `it(`/`test(` (excl. `.each`)   | 464        | 117            | 26          | 96        | 21        | 43            | 28      | 102               |
| `vi.mock(`                      | 40         | 10             | 0           | 0         | 0         | 0             | 0       | 0                 |
| `vi.fn(`                        | 81         | 25             | 0           | 14        | 0         | 0             | 0       | 0                 |
| `vi.spyOn(`                     | 3          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `toHaveBeenCalled*`             | 87         | 21             | 0           | 5         | 0         | 0             | 0       | 0                 |
| `vi.stubGlobal`                 | 4          | 2              | 0           | 13        | 0         | 0             | 0       | 0                 |
| `as any`                        | 0          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `as unknown as`                 | 23         | 2              | 9           | 3         | 1         | 1             | 2       | 0                 |
| `as never`                      | 3          | 5              | 0           | 0         | 0         | 0             | 0       | 7                 |
| real `setTimeout` sleeps        | 0          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| snapshots                       | 0          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `.skip`/`.only`/`.todo`         | 0          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `getByTestId`                   | 0          | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `*ByRole`                       | 102        | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `*ByLabelText`                  | 13         | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `*ByText`                       | 75         | 0              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `querySelector(All)`            | 114        | 5              | 0           | 0         | 0         | 0             | 0       | 0                 |
| `it('should …')`                | 102        | 0              | 22          | 0         | 0         | 0             | 0       | 0                 |
| `toBeTruthy()`                  | 28         | 0              | 1           | 0         | 0         | 0             | 1       | 0                 |
| hand-rolled `createRoot` mounts | 0          | 2              | -           | -         | -         | -             | -       | -                 |

More admin detail:

- `querySelector` appears in 35 of 74 files; `*ByRole` in 19. 46 queries select by an `.am-*` class, 39 by `[name=…]`, 11 assert a `data-*` attribute, 5 read `innerHTML`. `@testing-library/jest-dom` is not installed, so there is no `toHaveAccessibleDescription` or `toBeInvalid`.
- `vi.mock` targets: `astromech/fetch` 16, `virtual:astromech/admin-config` 11, owned admin hooks 9 (`use-admin-mutation` 5, `hooks/media` 3, `use-permissions` 2, `hooks/users` 1, `use-entry-form` 1; 8 files), `virtual:astromech/plugins/components` 1. 26 of 74 files (35%) are on the per-file isolation list because of these mocks or stubbed globals.
- Server stubbing is done 4 ways: mock `astromech/fetch` (16 files), `vi.stubGlobal('fetch')` (2), mock an owned hook (8), seed the query cache (several).
- Provider setup is hand-written per file: `new QueryClient` in 24 files, `QueryClientProvider` in 22, `i18n.init` in 28 (18 with the real `en.json`, 11 with an empty dictionary, so those assert translation keys), a hand-built TanStack router in 15.

Plugins: the assistant mocks `astromech` itself in 4 files and its own modules in 3 (`src/sessions/repository`, `src/approvals/repository`, `src/admin/use-chat`). No plugin or schema-engine suite measures coverage: the root `test:run` runs `test:coverage` only for core and the admin.

## Source with no meaningful coverage

Inferred from imports and component names in tests. A module reached through a page test counts as covered.

- **backups**: `src/routes/backups.ts` (download and restore raw routes, 128 lines). Restore overwrites the database and takes a pre-restore snapshot; download streams a full dump behind its own `download` permission. Neither route, nor the `run` and `delete` service methods, nor any permission, has a test. `src/admin/pages/backups-page.tsx` (338) is untested.
- **assistant**: `src/approvals/repository.ts` `claim`, `expireStale`, `findPending`, `rejectPending` (the SQL that makes an approval single-use, owner-only and unexpired) is only reached by `deleted-user.test.ts` via `createMany`. `chatRoutes` in `src/routes/chat.ts` (auth, tool filtering, `readOnly`, streaming) is untested; only `readChatRequest` is. `src/admin/slots/assistant-button.tsx` is untested.
- **seo**: `src/admin/pages/overview-page.tsx` (136) and `src/admin/fields/seo-preview-field.tsx` (57).
- **admin**: no test names `EntryNewPage` (232 lines, the create flow), `DeleteEntryModal` (136), `CreateLocaleModal` (165), `CommandPalette` (571), `NotificationBell` (197), `Topbar` (210), `useHotkeys` (98), `rich-text-editor.tsx` (646; `richtext-field.test.tsx` covers the field wrapper only), `MediaUsagePanel` (135), `StagingControls`/`PublishPanel` beyond what the edit-page tests reach. `src/pages/**` has a 7% line threshold.
- **schema-engine**: everything with behaviour is tested; `model.ts` and `index.ts` are types and re-exports.

## Findings

Ranked by the cost of leaving each problem. Each has principle numbers, location, category and fix.

### 1. Backups is tested through a hand-built context and a hand-written table, and its riskiest code is untested

- **P7, P8, P9, P12, P14, P20. WEAK, INCONSISTENT, AI-FRIENDLINESS.**
- `packages/plugins/backups/tests/backups.test.ts:56-86` creates `plugin_backups_runs` with raw DDL that has already drifted from `migrations/0000_baseline.ts`: it lacks the `CHECK` constraints on `status` and `trigger`, so a bad enum write passes here and fails in production. The harness already applies the backups chain (`FIRST_PARTY_PLUGIN_MIGRATIONS` in `packages/astromech/tests/_support/harness.ts:65`), and `createTestDb()` is file-backed, which `dump` needs.
- `:89-126` builds a `PluginContext` by hand with six services as `null as unknown as …` and a stale comment ("being ported to Kysely in a sibling agent", `:95-96`). Any code path that reaches `ctx.entries`, `ctx.config` or `ctx.users` throws a null error instead of exercising core.
- `:391-410` and `:298` insert `started_at` as a Unix integer into a column the plugin stores as ISO text (`:65` says so), so `rotate` is tested on data it never sees. `:433-437` re-sorts rows in the test (P16).
- `:186-286` tests core's `libsql` driver (`dump`, `restore`, `preserve`) from the plugin package; those belong beside `packages/astromech/src/database/drivers/libsql.ts`.
- Reads go through raw SQL (`:420`, `:461`, `:491`) rather than the plugin's `list` method (P14).
- The routes in `src/routes/backups.ts` (restore, download) and the service's `run` and `delete`, with their permissions, are untested.
- **Fix**: boot like forms and redirects: `createTestDb()` plus `setupTestConfig({ ...makeTestConfig(), plugins: [backups()] })`, call `list`/`run`/`delete` through `createServices(contextAs(role))`, and drive the two raw routes through `createHttpApp` with a role lacking and holding `download`/`restore`. Seed runs through the repository with ISO timestamps. Move the driver tests to core. Rename the 22 `should …` tests and drop the numbered header (`:9-16`) and `// 4.` comment (`:358`).

### 2. The assistant's approval storage is faked with no contract test, and its "repository" test tests a Map

- **P7, P8, P9, P12. WRONG-LEVEL, WEAK.**
- `packages/plugins/assistant/tests/loop/fake-approvals.ts:45-121` re-implements the `claim` predicate (owner, pending, unexpired, single use). That predicate is what stops a held mutation running twice or for another user, and the real SQL in `src/approvals/repository.ts` is never run against it. `fake-sessions.ts:3-4` says "the size cap … is covered there", but "there" is `sessions/repository.test.ts:17-33`, which mocks `astromech`'s `createRepository` with a `Map`, so no SQL runs either.
- `service/sessions.test.ts:18-34` mocks `astromech` (making `defineServiceMethod` an identity function) and both own repositories, then calls `.handler()` with a context cast through `unknown` (`:67-73`). Access rules and input parsing are bypassed.
- **Fix**: one contract suite (`describe.each([fake, real])`) over `ApprovalsRepository` and `SessionsRepository`, with the real side on libsql using the setup `sessions/deleted-user.test.ts:33-47` already has. Delete `repository.test.ts`'s `astromech` mock. Call the session methods through the registered service once the assistant can use the harness (finding 3).

### 3. Plugins reach core six different ways

- **P8, P15, P20, P22. INCONSISTENT, AI-FRIENDLINESS.**
- `currentServices.plugins['x'] as unknown as XService` with a string-keyed `callX()` wrapper: `forms/tests/forms.test.ts:76-83`, `seo/tests/service/seo.test.ts:27-34`, `menus/tests/menus.test.ts:27-33`.
- Typed `currentServices.plugins.redirects` with no cast: `redirects/tests/redirects.test.ts:19`, `service/redirects.test.ts:16`. So the cast in the other three is a missing type augmentation or a missing helper, not a necessity.
- `createServices(contextAs(role), { overrideAccess: false })`: forms and redirects, for permissions.
- Core runtime internals `getPluginIdentity`, `getPluginServiceMethods`, `createPluginContext`: `forms/tests/rate-limit.test.ts:31-48`.
- `.handler()` with a fake context and a mocked `astromech`: assistant `service/sessions.test.ts`.
- A hand-built `PluginContext`: backups.
- Plugin tests also import core internals to assert structure: `resolvePluginIdentity`, `resolveAdminResources`, `derivePluginNav` (`forms.test.ts:54-55,711-735`, `menus.test.ts:18-19,89-108`, `backups.test.ts:35,676`, `seo/tests/helpers/section.test.ts:7`).
- The assistant's `vitest.config.ts` resolves core through `dist` and says "every core value these tests reach is mocked". Its suite therefore needs a build first and never runs core.
- `localEntries as unknown as EntriesService` is repeated in 4 files (`forms.test.ts:74`, `seo.test.ts:45`, `rate-limit.test.ts:55`, `slug-change.test.ts:25`).
- **Fix**: add `pluginTestApp(plugin)` to `packages/astromech/tests/_support/` returning a typed `service`, `as(role)`, `entries`, `globals`, and `request(method, path)` over `createHttpApp`. Add `assistant` to the harness migrations and move it to `pluginVitestConfig()`. Pass the client address through the context helper so `rate-limit.test.ts` stops using runtime internals.

### 4. Admin pages mock owned hooks, including one keyed on its internal mutation-key layout

- **P1, P8, P10. WRONG-LEVEL.**
- `vi.mock('@/admin/hooks/use-admin-mutation')` in 5 files returns a fake that picks a spy by `options.mutationKey[1]` (`components/users/user-edit-page.test.tsx:78-85`, `media/media-detail-modal.test.tsx:71-76`, `media-detail-modal-replace.test.tsx:84`, `media-versions-panel.test.tsx:34`, `users/user-new-page.test.tsx:47`). Renaming a key breaks the tests with no behaviour change. The fake also skips invalidation and toasts, so the `xMutations()` tables these pages depend on are unverified here.
- `hooks/media` (3 files), `hooks/users` (`user-edit-page.test.tsx:68-75`), `use-permissions` (`plugins/plugin-slot.test.tsx:16-20`, `media/media-picker.test.tsx:30`).
- `entry-edit-locale-switch.test.tsx:82-105` wraps `useEntryForm` to subscribe to TanStack Form's `form.store` through an `as unknown as` cast. The header explains why (catch a transient partial group), but the test is tied to the hook's name and the form library's store shape.
- Meanwhile `global-edit-page.test.tsx:38-49` and 15 other files stub only `astromech/fetch`, the HTTP edge, which works for the same kind of page.
- **Fix**: stub only the client (`astromech/fetch`) and assert the outgoing request; seed permissions through `sessionQueryOptions` as `global-edit-page.test.tsx:163-176` does. For the locale switch, assert the saved payload and the rendered inputs after each switch instead of the store.

### 5. Admin registry tests leak into a shared module graph, and one cannot fail

- **P23, P24, P1. WEAK, AI-FRIENDLINESS.**
- The admin runs with `isolate: false`. `rendering/field-registry.test.ts:9` registers a dummy `text` component and `rendering/cell-registry.test.ts:8,14` registers `badge` and `text` into module-level maps. Any later file in the same worker that renders a text field or cell gets the dummy. `isolation-check` does not look for this kind of write.
- `cell-registry.test.ts:18` "returns a no-op renderer when nothing is registered" runs after `:14` registered `text`, so it gets the text renderer, and only asserts `typeof === 'function'` and no throw.
- **Fix**: export a `createFieldRegistry()`/`createCellRegistry()` factory (or a `reset` for tests) and test on a fresh instance; assert the fallback returns `null`.

### 6. Admin component tests half-apply Testing Library

- **P1, P15, P17. WRONG-LEVEL, INCONSISTENT.**
- 35 files use `querySelector`: `.am-page-header button` and `.am-modal-footer` to find buttons (`global-edit-page.test.tsx:240-261`), `.am-badge`/`.am-banner-info` (`:294`, `:385`), `input[name="tagline"]` instead of the "Tagline" label (`:233-237`), `.am-toast-*` class to read a toast variant (`hooks/use-bulk-delete-media.test.tsx:76-79`).
- The accessibility tests assert attributes through class selectors: `field-error-aria.test.tsx:38-138`, `field-wrapper-warning.test.tsx:36-85` (plus `data-warning`/`data-invalid` styling hooks). `getByRole('textbox', { name: 'Summary', description: 'A bit long for a summary' })` states the behaviour directly.
- 28 `expect(await screen.findByText(…)).toBeTruthy()`: `findBy` already throws.
- The assistant's admin tests have not had the admin's migration: `chat-drawer.test.tsx:12,282` and `use-chat.test.tsx:13,262` hand-roll `createRoot`, set `IS_REACT_ACT_ENVIRONMENT` themselves (`:32`, `:31`), find elements by `.am-assistant-*` classes (`chat-drawer.test.tsx:289-299`), and mock their own `use-chat` and `astromech/ui`'s `Button` (`:19-29`). Plugin suites get no `dom-setup.ts`, so they have no unmocked-request guard.
- **Fix**: query by role, label and accessible description; use `within(screen.getByRole('dialog'))` for confirm buttons. Add `@testing-library/jest-dom` for `toBeInvalid`/`toHaveAccessibleDescription`. Move the assistant tests to Testing Library and give `pluginVitestConfig()` the admin's `dom-setup.ts` for happy-dom files.

### 7. No shared admin render helper

- **P15, P20. INCONSISTENT, AI-FRIENDLINESS.**
- 15 files each build a TanStack router, and 22 build the provider stack (`QueryClientProvider` > `ToastProvider` > `AuthProvider` > `ConfirmProvider` > `AiContextProvider`). See `global-edit-page.test.tsx:163-231` and `user-edit-page.test.tsx:101-160`. 28 files initialise i18n, 18 with real strings and 11 with an empty dictionary, so half the suite asserts `'common.update'` and half asserts English.
- An agent copying the nearest file inherits whichever of these it lands on.
- **Fix**: `tests/_support/render-admin.tsx` exporting `renderPage(element, { url, permissions, config })` and one i18n setup file with the real `en.json`. Settle on asserting English text.

### 8. Expensive setup

- **P13, P20, P28. OPTIMISE.**
- Every plugin DB test calls `createTestDb()` in `beforeEach`: a new temp file, then the demo app's chain plus three plugin chains (`harness.ts:73-108`). That is about 160 tests across forms, menus, redirects, seo and the 4 `openapi.test.ts` files. Plugins also keep vitest's per-file isolation (`plugin-vitest-config.ts`).
- 26 admin files run isolated only because they `vi.mock` the client or the virtual config.
- **Fix**: migrate once per worker into a template file and copy it per test (a file copy, not a migration run). Inject the client and admin config through a React context (or a test-only setter) so the admin needs no module mocks and the isolated list shrinks.

### 9. Copy-pasted per-plugin contract tests, with gaps

- **P2, P3. REDUNDANT, INCONSISTENT.**
- `strict-input.test.ts` is identical in 5 plugins (17 lines each), `openapi.test.ts` exists for 4, `optimize-deps.test.ts` for 3. The assistant's strict-input check lives inside `service/sessions.test.ts:184-190`; seo and assistant have no OpenAPI check.
- **Fix**: one test in core's tests (or `packages/plugins/tests/`) that runs `methodInputs`/`openInputObjects`, `servedDocument` warnings and `missingFromOptimizeDeps` over every first-party plugin with `it.each`.

### 10. No coverage signal outside core and the admin; untested user flows

- **P29. WEAK.**
- Plugins and the schema engine run `vitest run` with no coverage, so the gaps listed above (backups routes and page, seo admin UI, assistant route and approvals SQL) never show.
- Admin: `EntryNewPage`, `DeleteEntryModal`, `CreateLocaleModal`, `CommandPalette`, `NotificationBell` have no tests.
- **Fix**: add per-directory thresholds to `pluginVitestConfig()` and schema-engine, set one point below what they measure. Write the entry-create and delete-entry flow tests first.

## Further findings

- **Global state reset by hand (P23, P24).** `forms` keeps a process-wide rate-limit map that every setup must reset (`forms.test.ts:130`, `rate-limit.test.ts:51,77,124,129`). `backups` keeps `globalThis.__astromechBackupRunning` (`backups.test.ts:43-45,154,158`). Core keeps `setDb`, `setConfig`, `registerPlugins`, `setEmailDriver`, `setStorageDriver` and `currentServices` global, so every test re-publishes them. This is an architecture item, not a test fix.
- **Trivial or structural tests (P1, P3).** `schema-engine/tests/identifiers.test.ts:16-20` asserts the constant 63; `:27-29` asserts `hash8(x) === hash8(x)`. `menus.test.ts:73-123` asserts the definition's `globals` and nav shape through core internals. `forms.test.ts:711-735` asserts the admin resource's method and column tables. `admin/tests/rendering/cell-kind-map.test.ts` restates a lookup table. `seo/tests/helpers/section.test.ts:20-26` asserts `name === 'seo'` and the label passthrough. `backups.test.ts:667-680` asserts field names on the settings global.
- **Duplicates (P2).** Redirects' basic lookup and slug-change cases appear in both `redirects.test.ts:270-325` and the folder files (their headers admit it). Keep one home per behaviour.
- **Logic in tests (P16).** `admin/tests/components/dev/ai-context-readout.test.tsx:36-40` computes the expected text with `formatAiContextMessage`, the function whose output it checks (the header says this is deliberate). `backups.test.ts:433-437` sorts rows.
- **Vague assertions (P17).** `redirects/tests/service/redirects.test.ts:85` `rejects.toThrow()` with no type or message. `plugin-slot.test.tsx:45` checks `innerHTML` contains `'drawer'`. `backups.test.ts:346` `row.key` `toBeTruthy` before a regex that already implies it.
- **Spying on the library instead of reading state (P11).** `entry-mutations.test.tsx:52,76` and `use-bulk-delete-media.test.tsx:51` spy on `queryClient.invalidateQueries`. `entry-query-keys.test.ts:59-72` shows the state-based form (`getQueryState(key).isInvalidated`).
- **Mocking the AI SDK function rather than the model (P7).** `assistant/tests/loop/run.test.ts:23-26,82-100` replaces `streamText` and re-creates its `onStepEnd` and `fullStream` contract by hand. The loop already takes `model` as a parameter, so the SDK's test model (`MockLanguageModelV2` from `ai/test`) can drive the real `streamText` with no `vi.mock`.
- **Hidden config (P15).** `admin/tests/_support/admin-config-shim.ts` holds the `forms/form`, `seo/settings` and full redirects-resource definitions several admin tests depend on, cast through `as unknown as AdminConfig`. 11 files then override it with a mutable `vi.hoisted` object reset in `afterEach`.
- **Fake timers (P25).** `forms/tests/rate-limit.test.ts:133` fakes every timer; the testing skill's rule is `toFake: ['Date']`. Harmless here (pure function), but it is the pattern an agent copies.
- **Unexpected signals (P26).** Only the admin's happy-dom files fail on an unmocked request. No suite in scope fails on unexpected `console.error`/`console.warn`, and the plugin and schema-engine suites have no network guard.
- **Duplicated DB helpers.** A libsql `makeDb()` is written out in `schema-engine/tests/oracle.test.ts:15`, `apply.test.ts:22`, `composite-primary-key.test.ts:33`, `generate.test.ts`, `rebaseline.test.ts`, `assistant/tests/sessions/deleted-user.test.ts:33-41` and `backups.test.ts:56`. The `:memory:` databases are never destroyed.
- **Naming (P2).** 124 `should …` names (admin 102, backups 22) against the rest of the suite's declarative style. Schema-engine uses code-shaped names (`prev === null → createTable …`, `diff.test.ts:15`). Headers in `backups.test.ts:9-16` and `menus.test.ts:1-10` are numbered or bulleted case lists.
- **Property tests worth adding (P31).** `capIdentifier` (output never exceeds 63 bytes; distinct inputs give distinct outputs), `renderLiteral` quote escaping, `diffSnapshots(s, s)` always empty, `readChatRequest` (never throws on any JSON), `entryAdminPath`/`globalAdminPath` round-trips with the route-param splitters.
- **Type tests (P6).** `seo/tests/helpers/section.test.ts:28-32` uses `expectTypeOf` inline, checked by `tsc` over `tsconfig.test.json`. It is the only type test in scope.

## Patterns worth keeping

- `forms/tests/forms.test.ts` and `redirects/tests/redirects.test.ts`: real migrated SQLite, the plugin registered through `setupTestConfig`, permissions checked through `createServices(contextAs(role), { overrideAccess: false })`, exact error payloads (`forms.test.ts:334-340`), and a leak test that first proves the secret is present before proving it is absent (`:191-250`).
- A recording email driver as the fake at the edge (`forms.test.ts:110-119`), and `fetch` stubbed only for the siteverify HTTP client (`spam.test.ts`).
- `assistant/tests/sessions/deleted-user.test.ts`: a migration tested against seeded orphan rows, with `PRAGMA foreign_key_check`.
- `admin/tests/_support/dom-setup.ts`: fails a test on an unmocked request and names the URL; and `tests/isolation-list.test.ts`, which keeps the isolated list honest.
- Admin page tests that stub only the client and assert the outgoing request body (`global-edit-page.test.tsx:297-316`), which is the visible outcome of a save.
- Schema-engine: typed snapshot builders in `tests/_support/tables.ts`, real in-memory SQLite, and generated migrations applied to a seeded database (`generate.test.ts:178`, `rebaseline.test.ts:402`).
- `field-error-aria.test.tsx`'s table over every field type, and file headers that say which assertion is load-bearing and why (`container-field-editing.test.tsx:1-16`).
- Zero `as any`, zero sleeps, zero snapshots, zero `.skip`/`.only` across the scope.

## Principles that look wrong or need a carve-out here

- **P8 needs an edge for the SPA.** `astromech/fetch` is owned code, but for the admin it is the network boundary, and stubbing it is the correct seam. State that the client module (or `fetch` itself) is the admin's edge, and that every other admin module is owned and must not be mocked.
- **P6's file split adds a runner for no gain.** Inline `expectTypeOf` in `.test.ts` already runs under `tsc` via each package's `tsconfig.test.json`. Keep "library code tests its public types"; drop the `*.test-d.ts` requirement.
- **P13 misses the cheapest reset for libsql files.** Copying a once-migrated template database per test beats truncate-and-seed and gives each test a fresh, committed schema. Name it.
- **P20's "boots once per worker" does not fit plugin tests.** Plugins vary their options per test (`forms.test.ts:121-134`, `setup({ storeMeta: false })`). Boot (config resolve and registration) costs nothing; the migration does. Split it: the database is built once per worker, the config per test.
- **P23 is an architecture change, not a test rule.** Config, database, drivers, plugin registry and `currentServices` are process globals in core today. Track it as a design item in `roadmap/` rather than a testing convention tests can follow on their own.
