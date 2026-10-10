# Backlog

Unscheduled work that belongs to no single feature: deferrals, small chores, and
questions to settle before something else can start.

Not a bug tracker. A live defect in shipped code gets a `roadmap/` file of its own
so its status can move — `completed/admin-form-defects.md` is the worked example.
Finished items are deleted rather than ticked; the record of what shipped is in
`roadmap/completed/`.

### Admin

- [ ] Investigate admin-page composition — one page rendering **both** a managed form and custom widgets (Sanity-style view tabs, or a custom component mounting managed form regions via a `useSettingsForm` hook). `AdminPage` XOR-validates `fields`/`component` today and was deliberately left open so this is additive (from `completed/unified-admin-pages.md`)
- [ ] No check finds an admin `t('…')` key with no English string, or a string nothing uses. A scan on 2026-10-02 found no missing key once `common.continue` was added, and about 60 strings that look unused (for example `globals.saved`, `entry.status.*`); some may be built at runtime. Decide whether `check:unused` or a small script should cover both.
- [ ] `useAuthorNames` fetches every user (`limit: 'all'`); replace it with a batched, `users:read`-gated `users.names({ ids })` when user counts warrant it.
- [ ] Unsaved-changes guard follow-ups (from `completed/unsaved-changes-guard.md`): restoring a media or user version (`components/media/media-detail-modal.tsx`, `components/users/user-edit-page.tsx`) does not reset a dirty form, so a later save overwrites the restore; a dirty page form plus a dirty dialog form ask twice on one Back; `isDirty` stays true after an edit is reverted (`form.state.isDefaultValue` exists, switch the Save button with it); TanStack Router's popstate blocker restores with `history.go(1)`, wrong after Forward or a multi-step go.
- [ ] `ConfirmProvider` (`components/ui/confirm.tsx`) runs `handleCancel` twice on Close (its `onClick` and `onOpenChange`), and a second `confirm()` replaces an open one and drops its callbacks. The user menu reads "Logout" (`topbar.logout`) where `nav.logout` says "Log out".
- [ ] Deleting a user lists the entries whose `relationship` fields name them before it confirms, as `entries/methods/used-by.ts` does for an entry, since the delete empties those fields (`DECISIONS.md`, "Users are deleted, not archived").

- [ ] The admin's login, forgot-password and reset-password pages hard-code "Sign in", "Email address", "Password" and "Signing in…" although i18n keys exist for them. A session that ends mid-use (`onUnauthorized` in `main.tsx`) lands on `/login` with no message; it could reuse the `error` search param that `access_denied` uses.

### Search

- [ ] Dedicated `GET /search` endpoint + `search()` SDK method — only if a public/programmatic search surface is needed
- [ ] `searchable?: false` opt-out on `EntryTypeConfig` — add when a titled root type should be excluded from search

### Method manifest and the AI surface

- [ ] Values that come from config are plain strings in the OpenAPI document and the method manifest: a user's `role` validates against the configured roles at parse time, but the schema cannot list them, since each method's `input` is built before the config. Consider building the documented schemas from the config so such values become enums
- [ ] Media ingest over JSON-RPC: `media.upload`/`replace` take a `File`, so they are the one thing the MCP/AI surface cannot call. Needs a path or base64 ingest method, declared as its own descriptor rather than by loosening `binaryInput`
- [ ] MCP tool-list size: the demo projects 144 tools, and `transport/mcp/server.ts` sends every one of them as a fixed prompt prefix to any MCP client. The assistant no longer has this problem — it takes a filtered surface (`ctx.methods.tools({ readOnly })`) and relies on deferred tool search to keep the rest findable — so what is left is whether the MCP server should filter too, and on what: source, entry type, or a client-supplied selection
- [ ] Reconcile entry `destructive` semantics: `entries.publish` collapses publish+unpublish into one action, so "unpublish is destructive" can't be expressed. Revisit when the permission model gains an `unpublish` action
- [ ] No way for a plugin service method to opt out of the method manifest. Every method a plugin declares becomes a CLI/MCP/AI tool, but some exist only to serve the plugin's own admin UI — P9's assistant session read/clear are the first, and they surface as MCP tools that no model should be reaching for. The loop already refuses plugin-source methods when scoped and MCP is dev-only, so today it is noise rather than exposure. The precedent for a declaration that steers the transport is `binaryInput` on `media.upload`
- [ ] The assistant's requests set no `cache_control`, so nothing is cached, though `buildRequest` in `packages/plugins/assistant/src/loop/request.ts` places AI context "past the last cache breakpoint". Top-level automatic caching would put the breakpoint on the last block, which is the per-request context message, so the next request would miss. A breakpoint on the final turn before the context (the provider's `cacheControl` part option) keeps the tools, system prompt and history cacheable. Found while adding `instructions`, which sits in the system prompt and stays fixed per site.

### Services

- [ ] To discuss: a bound service method throws synchronously when its input fails to parse, rather than returning a rejected promise, so a caller's `.catch()` misses the error and tests need an `attempt()` wrapper (`packages/astromech/tests/entries/write-policy.test.ts`, `packages/astromech/tests/services/define-service.test.ts`). Decide whether bound methods always reject. Raised by the test suite review (`roadmap/completed/test-suite-review.md`)

### Plugins

- [ ] `PluginDefinition.requiredEnv` exists, is validated at boot with a clear error, and no shipped plugin declares it. The one env var a plugin genuinely depends on — the assistant's `ANTHROPIC_API_KEY` — can't use it, because the AI SDK reads the key during config evaluation (before plugin boot), which is why site configs must open with `import 'dotenv/config'`. Either find `requiredEnv` a real first user or decide the config-evaluation-time class of env needs its own answer

### Tooling

- [ ] Under the gate, `check:boot:cloudflare` starts the build and wrangler in process groups of their own, which no lock record lists (`scripts/run-lock.mjs` keeps one owner's record). If the gate and the check are both killed outright, wrangler keeps running. Fixing it needs the lock to accept groups from more than one process. `check:boot`'s Chromium is not recorded either, since playwright does not expose its pid.
- [ ] `check:install` builds and installs a scratch site but does not take the run lock.
- [ ] Bash hook gaps left after `roadmap/completed/agent-workflow.md`: a `cd` inside `if`, `while` or `for` counts as done, so `if x; then cd <worktree>; fi; git reset --hard` is silent in the main checkout (the same class as the `&&` gap the hook's header notes); unquoted glob operands (`curl https://x?y=1`), attached short forms (`rg -g*.ts`) and `fd -g *.ts` are not refused; zsh glob qualifiers (`*(.)`) and extglob patterns in `case` do not parse, so the hook asks.
- [ ] Re-evaluate a dependency lint (dependency-cruiser or similar) as a QA hardening layer once development shifts from building to hardening — dropped while building, `DECISIONS.md`

### Relationships follow-ups (from `completed/relationships-model.md`)

The model shipped whole; these are the deliberate deferrals and the sharp edges found building it.
The rationale for the first two is in `DECISIONS.md` and should
not be re-derived.

- [ ] **A declared reverse field** — deferred, not refused (`DECISIONS.md`). Reverse lookup needs no
      declaration: it is an indexed read, and `where: { references }` already covers the delete modal,
      media "used by" and filter-by-relation. A declared virtual field would be sugar compiling to
      that same query and can be added without touching the repository. **If it comes back it must be keyed
      on the forward field PATH, never on a relation name** — Payload, Keystone and Directus all key
      on path and cannot desync; Strapi requires two independently-written names and that produced
      duplicate join tables and silent relation-data loss.
- [ ] **`WITHOUT ROWID` on the relationships table.** On a rowid table a composite primary key is a
      unique index plus a hidden rowid, so the space win only arrives with `WITHOUT ROWID`, and the
      row sits right at SQLite's recommended size boundary once an instance path carries nested ids.
      A pure physical-layout decision, takeable later without touching the logical schema.

### Storage-layer follow-ups (from `completed/storage-layer-follow-ups.md`)

- [ ] Route `plugin-purge.ts`'s raw `sql` delete against the plugin-tracking
      table through `deleteMany`, if its sibling raw DDL and `kysely_migration`
      statements in the same command ever move too. Left raw because converting
      one of a cluster reads worse than leaving all of them.
- [ ] `performBackup`'s status transitions are `updateMany` + `findOne` (two
      round-trips) rather than one `UPDATE … RETURNING`, because `repository.update`
      throws on a missing row and that would have turned the catch block's
      failure-recording into a thrown backup. Collapsible via `query()` if the
      extra round-trip ever matters.

- [ ] Nothing removes stale `tmp/` keys from storage. `replaceMedia` deletes its copy of the old original once it finishes, but a crash mid-replace, or a copy kept because its restore failed, leaves one behind. Sweep keys older than a day, in the trash purge job (`packages/astromech/src/entries/jobs/trash-purge.ts`) or a CLI command (from `completed/media-replace-overwrites-before-commit.md`)

### `@astromech/forms` follow-ups

- [ ] File-upload fields — needs a multipart `rawRoute` (raw routes are streaming-only) plus media ingest for the uploaded file
- [ ] CSV export of submissions
- [ ] A frontend form component/helper. v1 deliberately exposes data only (`forms.get`) and lets the site author own the markup, following the redirects precedent — revisit if hand-rendering proves tedious in practice
- [ ] Per-form success redirect, once there is a frontend story to redirect within
- [ ] More notification providers now the seam exists — Slack, Mailchimp, a generic webhook. Each is one file in `notifications/providers/` plus a `registry.ts` entry; the editor block and the delivery come as a pair
- [ ] The forms `afterSubmit` payload carries the caller-supplied `meta` and the spam `token` whatever `storeMeta` says; decide whether `storeMeta: false` should keep them from subscribers too.
- [ ] An Astro page or action that calls forms `submit` on the server passes no visitor address, so the spam providers get no `remoteip` and the forms rate limit has no key. The Astro middleware could put Astro's `clientAddress` on the request scope when it is trusted.
- [ ] Notification providers are a closed built-in list. A site can write a `SpamProvider` and pass it through config, but there is no equivalent option for a `NotificationProvider` — the registry is compiled in. Open it up if a site needs a kind we don't ship

### `@astromech/backups` follow-ups

- [ ] Turso / remote-libsql dump support — `VACUUM INTO` requires a local file; needs an alternative path for remote connections
- [ ] D1 dump/restore — Time Travel / export-to-R2 (gated on D1 driver landing)
- [ ] Admin-editable backup **schedule** (retention is editable via the plugin's `/settings` page): the cron schedule is consumed once at boot when the job is registered, so a settings override needs runtime cron re-registration — a feature, not a wiring fix
- [ ] Encryption at rest for backup artifacts
- [ ] Multi-instance run-now lock — reuse the `_astromech_cron` lock so a concurrent scheduled + manual run across processes is guarded (v1 uses an in-process flag only)
- [ ] A stored backup that is not valid gzip answers 500 from the restore route's gunzip stream; it is an unusable backup like the ones `InvalidBackupError` answers 422 for
- [ ] The assistant's chat posts with a raw `fetch` (`packages/plugins/assistant/src/admin/use-chat.ts`), so a 401 there shows an inline error instead of signing the user out through the admin's query client

### AI context follow-ups (P6, 2026-08-03)

- [ ] Entry **creation** routes (`new.tsx`) and **version-history** routes (`versions.tsx`) declare no AI context. A `{ kind: 'entries', type }` with no `id` renders as "Entry list for type X" via `describeReference`, which would describe a creation screen as a list — actively misleading, so they were left undeclared. Needs either a new `AIContextKind` or an extra wording branch in `ai/context-message.ts` before they can be wired
- [ ] **Modal-driven detail views declare nothing** — opening a media item from the library (`MediaDetailModal` on the media index) still reports only the library at depth 0. The reference should be declared by whatever is actually in view, not by the route alone; a modal is the first case where those differ
- [ ] No **field-level** reference yet. Depth 1 is the deepest anything declares, so "this field" has nothing to resolve against. The ordered-list design already accommodates it (a focused field editor at depth 2); the open question is what withdraws the reference on blur without thrashing the store

### Console logging follow-ups

- [ ] Browser-safe `log`. `utilities/log.ts` writes to stderr via `console.error` (Node/serving side). Two admin browser-side calls still hardcode the `[Astromech]`/`[astromech]` prefix — `packages/admin/src/i18n.ts` and `packages/admin/src/components/ui/instance-guard.ts` — because stderr routing is wrong in a browser. Needs a browser log variant before they can move off the hardcoded string.

### Runtime integrations follow-ups

- [ ] Rename `apps/demo` to name its runtime, now that a second runtime demo exists. It touches `check:boot`, `check:config`, `AGENTS.md` and several docs paths, so it is worth doing when a third demo makes the set obvious rather than on its own
- [ ] The D1 driver reports itself remote whether it is reaching the real database or wrangler's local emulation, and cannot tell the two apart. So `db:init` and `db:status` against a local D1 need `--allow-remote`, which is the flag that exists to make a genuinely remote write deliberate

### Test harness follow-ups

- [ ] Nothing stops a new in-process test from starting wrangler without `enterWranglerProject()` (`packages/astromech/tests/_support/wrangler.ts`), and its state would land in core's shared `.wrangler` directory again. The run's teardown could fail when that directory changed during the run.
- [ ] The scripts' temp directories (`astromech-check-boot*`, `astromech-check-install-*`) and older test directories (`astromech-integration-*`, `astromech-migration-transaction-*`) are left in `os.tmpdir()` when a run is interrupted. The test sweep covers only `astromech-test-*`. Sweep the scripts' directories when each script starts, and clear the old ones once by hand.
- [ ] The schema-engine tests make temp directories in `os.tmpdir()` without the leftover check core and the plugins have. They clean up in `finally` and `afterAll` today.
- [ ] Local `typecheck` can miss an error a module augmentation causes in an unchanged file: core's `tsconfig.test.json` is `incremental`, and with a cached build info a new `declare module 'astromech'` in a test file did not re-report TS2322 in `packages/astromech/src/plugins/define-hook.ts` (seen 2026-10-02; `--incremental false` showed it). CI starts with no cache, so it catches these. Decide whether the local gate should drop `incremental` or clear the cache.
- [ ] The backups plugin's tests still hold libsql driver tests (`dump`/`restore` round trip, rollback, foreign keys, `file:` and in-memory errors, `preserve`) that core's coverage cannot see. Move them to `packages/astromech/tests/database/drivers/libsql.test.ts`, as the restore checks were on 2026-10-03, and keep only the plugin's own route and admin cases.
- [ ] Leftovers from the test suite review (`roadmap/completed/test-suite-review.md`):
    - The translation conformance table covers media and users only, so entries and globals keep their own shared-field and relationship tests. Fold all four.
    - The admin tests build an `Entry` with `as unknown as Entry` in 10 places. Add a typed admin `Entry` builder.
    - The assistant's admin tests still mock `astromech/ui` and their own `use-chat`.
    - The backups libsql dump and restore tests use a hand-written runs table instead of the migration, and `resolveKeep`'s tests replace `ctx.globals` with a fake.
    - `entry-edit-locale-switch.test.tsx` still wraps `useEntryForm` to watch a transient partial `seo` group that no output shows.

### Permissions follow-ups

- [ ] A plugin service method can demand a permission its plugin never declares in `permissions`, and nothing catches it, so `astromech permissions` would not list it. A check when the plugin registers would, at the cost of a new boot error. Found fixing `completed/permission-catalogue-drifts-from-manifest.md`.
- [ ] The admin restates which methods a resource offers by reading capabilities directly (`packages/admin/src/components/entries/entry-edit-page.tsx` near line 312, `packages/admin/src/components/globals/global-edit-page.tsx` near line 142, `packages/admin/src/hooks/use-edit-controller.ts` near line 188). They agree with the methods today; reading the method manifest instead would remove the second source.

### Content follow-ups

- [ ] `packages/astromech/src/content/versions.ts` falls back to the current fields (`?? current.fields`) when a stored version has none, but no write can store a version without fields: every repository maps null to `{}` before `snapshotVersion`. Remove the fallback, or say what old data it is for. Found in stage 4 of `roadmap/completed/test-suite-review.md`.
- [ ] Decide what a slug is for a title with no ASCII letters. `slugify` keeps only ASCII letters and digits, so a Japanese, Greek or Cyrillic title gets no slug, and accents are dropped rather than converted (`Café` becomes `caf`). Transliterate, allow Unicode slugs, or keep it and say so. Found by the slug property tests in stage 5 of `roadmap/completed/test-suite-review.md`.
