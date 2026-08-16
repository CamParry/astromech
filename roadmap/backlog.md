# Backlog

Unscheduled work that belongs to no single feature: deferrals, small chores, and
questions to settle before something else can start.

Not a bug tracker. A live defect in shipped code gets a `roadmap/` file of its own
so its status can move — `planned/admin-form-defects.md` is the worked example.
Finished items are deleted rather than ticked; the record of what shipped is in
`roadmap/completed/`.

### Admin

- [ ] Investigate admin-page composition — one page rendering **both** a managed form and custom widgets (Sanity-style view tabs, or a custom component mounting managed form regions via a `useSettingsForm` hook). `AdminPage` XOR-validates `fields`/`component` today and was deliberately left open so this is additive (from `completed/unified-admin-pages.md`)

### Boot

- [ ] `initRuntime` still ends with `process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute`, read back inside `getAuth()` (`packages/astromech/src/users/auth.ts`). The read is request-time and correct; the **write** is the problem — on Workers `process.env` is a compatibility shim populated from bindings, not a plain mutable object, so the assignment is not guaranteed to do anything there. Replace the channel with a registry slot, or pass `apiRoute` into `getAuth()` from the caller (deferred from `completed/workers-cron-never-boots.md`)

### Search

- [ ] Dedicated `GET /search` endpoint + `search()` SDK method — only if a public/programmatic search surface is needed
- [ ] `searchable?: false` opt-out on `EntryTypeConfig` — add when a titled root type should be excluded from search

### Method manifest and the AI surface

- [ ] Media ingest over JSON-RPC: `media.upload`/`replace` take a `File`, so they are the one thing the MCP/AI surface cannot call. Needs a path or base64 ingest method, declared as its own descriptor rather than by loosening `binaryInput`
- [ ] MCP tool-list size: the demo projects 144 tools, and `transport/mcp/server.ts` sends every one of them as a fixed prompt prefix to any MCP client. The assistant no longer has this problem — it takes a filtered surface (`ctx.methods.tools({ readOnly })`) and relies on deferred tool search to keep the rest findable — so what is left is whether the MCP server should filter too, and on what: source, entry type, or a client-supplied selection
- [ ] Reconcile entry `destructive` semantics: `entries.publish` collapses publish+unpublish into one action, so "unpublish is destructive" can't be expressed. Revisit when the permission model gains an `unpublish` action
- [ ] Nothing stops `astromech mcp` or the CLI being pointed at a production database. The D1-in-Node failure that currently prevents it is accidental, not a guard. Decide the shape: a warning, a `--force` flag, or a driver allowlist
- [ ] No way for a plugin service method to opt out of the method manifest. Every method a plugin declares becomes a CLI/MCP/AI tool, but some exist only to serve the plugin's own admin UI — P9's assistant session read/clear are the first, and they surface as MCP tools that no model should be reaching for. The loop already refuses plugin-source methods when scoped and MCP is dev-only, so today it is noise rather than exposure. The precedent for a declaration that steers the transport is `binaryInput` on `media.upload`

### Plugins

- [ ] `PluginDefinition.requiredEnv` exists, is validated at boot with a clear error, and no shipped plugin declares it. The one env var a plugin genuinely depends on — the assistant's `ANTHROPIC_API_KEY` — can't use it, because the AI SDK reads the key during config evaluation (before plugin boot), which is why site configs must open with `import 'dotenv/config'`. Either find `requiredEnv` a real first user or decide the config-evaluation-time class of env needs its own answer
- [ ] A plugin can't type its own declared hook-event payloads. `AstromechPluginHookEvents` is codegen-augmented per **site**, so inside a plugin package `defineHook`'s handler parameter resolves to `unknown` and every handler needs an in-body cast (see `@astromech/forms`' spam hook). Annotating the parameter directly is a contravariance error. Some way for a plugin to declare the payload type alongside the event name would remove the cast

### Relationships follow-ups (from `completed/relationships-model.md`)

The model shipped whole; these are the deliberate deferrals and the sharp edges found building it.
The rationale for the first two is in `decisions/0004-relationships-as-a-derived-index.md` and should
not be re-derived.

- [ ] **A declared reverse field** — deferred, not refused (`decisions/0004`). Reverse lookup needs no
      declaration: it is an indexed read, and `where: { references }` already covers the delete modal,
      media "used by" and filter-by-relation. A declared virtual field would be sugar compiling to
      that same query and can be added without touching storage. **If it comes back it must be keyed
      on the forward field PATH, never on a relation name** — Payload, Keystone and Directus all key
      on path and cannot desync; Strapi requires two independently-written names and that produced
      duplicate join tables and silent relation-data loss.
- [ ] **`WITHOUT ROWID` on the relationships table.** On a rowid table a composite primary key is a
      unique index plus a hidden rowid, so the storage win only arrives with `WITHOUT ROWID`, and the
      row sits right at SQLite's recommended size boundary once an instance path carries nested ids.
      A pure storage decision, takeable later without touching the logical schema.
- [ ] **A `tableStorage`-backed target accumulates dangling ids forever.** The write-time cleanup
      keeps any id whose target type is table-backed, because those rows are not in the `entries`
      table and an existence check there reports every one of them absent — pruning would delete live
      references. Correct, but it means those paths never self-clean. Fixing it properly means a
      per-storage existence hook on `EntryStorage` rather than a table query. Same guard, same
      reason, applies to a target naming no configured entry type.

### Storage-layer follow-ups (from `completed/storage-layer-follow-ups.md`)

- [ ] Give the `users` table a real `defineTable` descriptor so
      `users/storage.ts` can compose on `createStorage` like every other domain.
      Needs the column vocabulary to express better-auth's format —
      seconds-INTEGER timestamps and uuid ids — and better-auth still owns the
      DDL, so the baseline's hand-authored `users` table would have to agree with
      a descriptor it does not generate. Would let `LEGACY_CODECS` shrink. This
      is the "own the `users` table" question, and it is no longer blocked on
      editorial columns: `planned/profile-entry-type.md` keeps editorial data off
      `users` entirely, so what remains is purely about who controls the DDL.
- [ ] Derive `encodeWith`'s return type from the descriptor. It returns a bare
      `Record<string, unknown>` because the `*With` form takes a descriptor as an
      _argument_ rather than being descriptor-_typed_. No `encodeWith` call site
      casts today — the two `as unknown as Insertable<DB[…]>` casts left in the
      repo are both on the string-keyed `encode('users', …)` path
      (`users/storage.ts`, `transport/cli/commands/users-create.ts`) and belong to
      the `users` descriptor item above. So this is a typing improvement with no
      cast to remove, which is why it keeps being deferred.
- [ ] Decide whether storage should support **savepoint-based nested
      transactions**. Kysely refuses nesting outright, so a tx-bound storage's
      `transaction()` now fails loudly rather than silently escaping the outer
      rollback. No production path nests today.
- [ ] Route `plugin-purge.ts`'s raw `sql` delete against the plugin-tracking
      table through `deleteMany`, if its sibling raw DDL and `kysely_migration`
      statements in the same command ever move too. Left raw because converting
      one of a cluster reads worse than leaving all of them.
- [ ] `performBackup`'s status transitions are `updateMany` + `findOne` (two
      round-trips) rather than one `UPDATE … RETURNING`, because `storage.update`
      throws on a missing row and that would have turned the catch block's
      failure-recording into a thrown backup. Collapsible via `query()` if the
      extra round-trip ever matters.

### `@astromech/forms` follow-ups

- [ ] File-upload fields — needs a multipart `rawRoute` (raw routes are streaming-only) plus media ingest for the uploaded file
- [ ] CSV export of submissions
- [ ] Rate limiting on `submit` — there is none, so the only spam defence is the optional provider gate
- [ ] A frontend form component/helper. v1 deliberately exposes data only (`forms.get`) and lets the site author own the markup, following the redirects precedent — revisit if hand-rendering proves tedious in practice
- [ ] Per-form success redirect, once there is a frontend story to redirect within
- [ ] A read-only entry flag in core, so `forms/submission` can express "written by the API, never hand-authored" directly instead of relying on a site granting read+delete and withholding create+update
- [ ] More notification providers now the seam exists (`decisions/0002`) — Slack, Mailchimp, a generic webhook. Each is one file in `notifications/providers/` plus a `registry.ts` entry; the editor block and the delivery come as a pair
- [ ] Notification providers are a closed built-in list. A site can write a `SpamProvider` and pass it through config, but there is no equivalent option for a `NotificationProvider` — the registry is compiled in. Open it up if a site needs a kind we don't ship

### `@astromech/backups` follow-ups

- [ ] Turso / remote-libsql dump support — `VACUUM INTO` requires a local file; needs an alternative path for remote connections
- [ ] D1 dump/restore — Time Travel / export-to-R2 (gated on D1 driver landing)
- [ ] Postgres dump/restore — `pg_dump`/`pg_restore` (gated on Postgres driver, Phase 23)
- [ ] Admin-editable backup **schedule** (retention is editable via the plugin's `/settings` page): the cron schedule is consumed once at boot when the job is registered, so a settings override needs runtime cron re-registration — a feature, not a wiring fix
- [ ] Encryption at rest for backup artifacts
- [ ] Multi-instance run-now lock — reuse the `_astromech_cron` lock so a concurrent scheduled + manual run across processes is guarded (v1 uses an in-process flag only)

### AI context follow-ups (P6, 2026-08-03)

- [ ] Entry **creation** routes (`new.tsx`) and **version-history** routes (`versions.tsx`) declare no AI context. A `{ kind: 'entries', type }` with no `id` renders as "Entry list for type X" via `describeReference`, which would describe a creation screen as a list — actively misleading, so they were left undeclared. Needs either a new `AIContextKind` or an extra wording branch in `utilities/ai-context.ts` before they can be wired
- [ ] **Modal-driven detail views declare nothing** — opening a media item from the library (`MediaDetailModal` on the media index) still reports only the library at depth 0. The reference should be declared by whatever is actually in view, not by the route alone; a modal is the first case where those differ
- [ ] No **field-level** reference yet. Depth 1 is the deepest anything declares, so "this field" has nothing to resolve against. The ordered-list design already accommodates it (a focused field editor at depth 2); the open question is what withdraws the reference on blur without thrashing the store
- [ ] `scopedServices(role: Role | undefined)` does not accept `ctx.role`, which is `Role | null`, so a plugin passing `ctx.role` straight through would need `?? undefined`. **No plugin calls it yet** — the only two callers are core (`transport/tools/dispatch.ts`, `transport/http/routes/rest-route.ts`) and both pass a compatible type, so nothing is paying this cost today. Widen the signature to `Role | null | undefined` (and check `permissionsFor` alongside it) at the first real plugin call site; `ctx.role` matching `ctx.user`'s `| null` is the right shape, so the wrapper is what should bend
