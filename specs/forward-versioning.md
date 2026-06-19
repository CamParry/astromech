# Spec — Forward versioning (staged entries)

**Status:** design-locked + implementation plan. Unbuilt. Ephemeral — delete once
shipped (never link from durable docs). Durable terminology lands in
`TERMINOLOGY.md` at ship via `/feature`.

## Principle

Astromech edits live: saving a published entry mutates the live row in place
(WordPress weakness). This adds **forward versioning** — prepare the next version
of an already-live entry, review/preview it, then merge it on purpose — without
touching the live version. Backward versioning (immutable history) already exists
and is unchanged.

## Two distinct concepts (do not unify)

- **Version** — immutable past snapshot, record-keeping. Append-only
  (`entry_versions`, unchanged).
- **Staged entry** — a mutable, prepared _future_ change ("staging a change").
  Modelled as a **separate, fully-editable `entries` row** linked to its
  canonical entry via `stagedFor`. Reuses all entry machinery (fields,
  validation, preview, its own version history).

Pointer-to-current-version and editable-row-in-versions-table were both
considered and rejected: the former taxes every collection list/filter/sort
query; the latter shoe-horns mutable drafts into an immutable log. A staged entry
being _just another entry_ gives the uniformity the pointer model promised, at
the entry abstraction instead.

## Locked decisions

- **`staging` is its own per-type capability**, default off, **independent of
  `versioning`**. Requires **built-in storage** in v1 (table-backed staging is a
  future open question — the custom table would need its own `stagedFor`).
- **Status rename `draft` → `unpublished`** — hard rename across the codebase
  (~22 literals) + data migration, no back-compat alias. `private` rejected
  (implies role-based front-end visibility).
- **Merge = backup→update→cleanup**, canonical id preserved. **Backup is
  conditional on `versioning`** (skipped if off). Slug not copied (locked).
- **Parallel editing** of current + staged allowed; warn on save + warn at merge
  on divergence (`canonical.updatedAt > staged.createdAt`); no auto 3-way merge.
- **Slug locked in a staged entry**; staged rows excluded from the slug unique
  index and from entry lists.
- **`createStaged` throws if one exists** (`StagedEntryExistsError` with the
  existing id); the admin catches + redirects. Service stays dumb.
- **Preview** = token authorizes + readable URL selector, reusing the published
  slug route. Returns the **public shape** (gate bypassed), not full. Invalid/
  absent token → **404** (no existence hints).
- **Staged entries are never trashed** — `deleteStaged`, merge cleanup, and the
  canonical-trash cascade all **hard-delete**.
- **Permissions** (start here, may revisit): `createStaged`/edit-staged/
  `deleteStaged` + issue/revoke token = entry `update`; `mergeStaged` = `publish`.

## Data model (schema diffs)

`packages/astromech/src/types/domain.ts:17`

```ts
export type EntryStatus = 'published' | 'scheduled' | 'unpublished'; // was 'draft'|...
```

`packages/astromech/src/entries/schema.ts` — `entriesTable`:

```ts
status: text('status', { enum: ['published','scheduled','unpublished'] })
  .notNull().default('unpublished'),                 // was default('draft')
stagedFor: text('staged_for').references((): AnySQLiteColumn => entriesTable.id,
  { onDelete: 'cascade' }),                          // nullable; non-null = staged row
```

- Replace `uniqueIndex('entries_type_locale_slug_unique')` with a **partial**
  unique index `WHERE staged_for IS NULL` (staged rows share the canonical slug).
- A staged row gets a **fresh `localeGroup`** (the default UUID — it does not join
  the canonical's locale group; `stagedFor` is the only link). This keeps the
  `(localeGroup, locale)` unique index satisfied **without** making it partial, so
  only the slug index above needs the `WHERE staged_for IS NULL` change.
- Add index on `stagedFor`.
- Mirror the enum change in `entryVersionsTable.status` and the Zod
  `entryStatusEnum` (`schema.ts:98`).

New table `entryPreviewTokensTable` (mirror `sessions`/`verifications`):

```ts
sqliteTable('entry_preview_tokens', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    entryId: text('entry_id')
        .notNull()
        .references(() => entriesTable.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(), // hash of the secret, never the plaintext
    expiresAt: integer('expires_at', { mode: 'timestamp' }), // nullable = no TTL
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    createdBy: text('created_by').references(() => usersTable.id),
});
```

One token per canonical entry authorizes its current + staged + versions.

Capability (`storage/capabilities.ts:7`): add `'staging'` to `Capability`;
`BUILT_IN_SUPPORTS` includes it; `resolveEntryCapabilities` reads
`cfg.staging ?? false`.

## Operations & ordering

- **Create** — canonical entry, `status: unpublished`, no staged entry; edits
  write the row directly.
- **Save (current, unpublished)** — updates row, stays `unpublished`, snapshots a
  version (if versioning on).
- **Save (current, published)** — **goes live immediately** + snapshots a
  version. Quick-edit path. Warn if a staged entry also exists.
- **Publish / Unpublish / Schedule** — status transitions on the canonical
  (`unpublish()` now sets `unpublished`, was `draft` — `service.ts:1086`).
- **Stage a change (`createStaged`)** — copy canonical content + relations into a
  new row with `stagedFor = canonicalId`, a **fresh `localeGroup`**, and
  `status: unpublished`. Throws if one already exists. Allowed on any canonical
  entry regardless of status.
- **Merge (`mergeStaged`)** — strict order: **1. backup** (if versioning:
  snapshot canonical → version) → **2. update** (copy staged content + relations
  into the canonical row; id preserved → external refs stable; slug not copied) →
  **3. cleanup** (hard-delete staged entry; its history cascades). Wrap in a
  storage transaction where the driver supports it; backup-first keeps partial
  failure safe.
- **Discard (`deleteStaged`)** — hard-delete the staged entry.

### Divergence (clobber)

Merge overwrites current with staged content → can clobber edits made to current
after the staged entry was created. v1: **warn at merge time** when
`canonical.updatedAt > staged.createdAt`. No automatic resolution — user decides.

## Preview & visibility

Reuses the published slug route (industry "draft mode" Pattern B). No dedicated
route, no id in the URL, no slug mangling.

```
/blog/my-post?preview=<token>              → current (unpublished) — clean default
/blog/my-post?preview=<token>&staged=1     → the staged entry
/blog/my-post?preview=<token>&version=<id> → a historical version (future; wins if both)
```

- **Token** authorizes; per canonical entry; random secret, stored **hashed**;
  revocable; optional TTL. Authorizes only — selectors pick the layer.
- **Shape = public** (same as the live front-end). Preview just **bypasses the
  publish/schedule gate** for the token-authorized entry; field projection /
  rich-text rendering / `deletedAt` still apply (a trashed entry never previews).
  `full` stays admin-only.
- **Invalid/absent token → normal public behaviour** → non-published content
  returns null → 404. No error that reveals existence.

Visibility change (`visibility.ts`): the public path (`passesPublicRowFilter`,
`visibility.ts:101`) gains a `preview` mode that skips the `status`/`publishedAt`
gate but keeps the `deletedAt` check and all field projection. Token verification
happens in the service read path before selection.

## Admin UX

- A staged entry is edited at **its own admin URL** (`/entries/$type/<stagedId>`)
  — its own id. The **Current | Staged toggle is navigation between the two
  URLs**, not a JS flip: shareable, new-tab-able, immune to saving the wrong row.
- Staged edit page shows a banner ("Staged change of _<title>_") + toggle to
  current.
- "Stage a change" calls `createStaged`; on `StagedEntryExistsError` the UI
  **redirects to the existing staged entry** (id from the error).
- Action set by layer/status:
    - current/unpublished: Save · Publish · Preview
    - current/published: Save (live) · Unpublish · Preview
    - staged: Save · Merge & publish · Discard · Preview staged
- Staged entries **excluded from entry lists** (`stagedFor IS NULL` filter in
  `query`/`list`).
- Rename version-history UI strings **"revisions" → "versions"**
  (`admin/locales/en.json` `versions.revisionsLink_*`, etc.).

## Service API, transport & SDK

Service methods live in `entries/service.ts` (policy), persisting via storage;
single-id (not bulk). Mirror the thin-wrapper convention:

- `createStaged({ type, id })` → `Entry` (throws `StagedEntryExistsError`)
- `getStaged({ type, id })` → `Entry | null`
- `mergeStaged({ type, id })` → `Entry` (canonical; backup→update→cleanup)
- `deleteStaged({ type, id })` → `void` (hard delete)
- `issuePreviewToken({ type, id, expiresAt? })` → `{ token }` (plaintext returned
  once; only the hash is stored)
- `revokePreviewToken({ type, id })` → `void`
- **`get`/`query` gain** `previewToken?: string` + `staged?: boolean`. Editing a
  staged entry reuses normal `update`/`versions`/`restoreVersion` (it's an entry).

Wiring per new method (the map confirmed each surface is explicit):

- **HTTP routes** (`transport/http/routes/entries.ts`): `POST
/entries/:type/:id/staged` (create), `GET …/staged`, `POST …/staged/merge`,
  `DELETE …/staged`, token issue/revoke; thread `previewToken`/`staged` query
  params into `get`/`query`.
- **Local transport** — free (exposes the whole service object,
  `local/index.ts:42`); just update the `TypedEntriesApi` type.
- **HTTP client** (`transport/http/client`): add matching methods.
- **Method manifest** (`codegen/method-manifest.ts:124` `ENTRY_METHODS`): add
  `createStaged`/`getStaged`/`mergeStaged`/`deleteStaged` with actions
  (update/read/publish/update).
- **Front-end read** ergonomics: `ctx.sdk.entries.get({ type, slug,
previewToken, staged })` maps 1:1 to the URL params.

## AI integration (substrate, not bespoke)

Substrate for the AI confirm-gate (memory `ai-integration-inflight`): for large
page changes AI calls `createStaged` then `update`s the staged entry; a human
reviews via the normal staged UI + preview and merges. **No AI-specific staging
table. Entries only** — not settings, media, or users (no versioning/staging
there).

## Migration (app-owned)

Per memory `app-owned-migrations`: generate via root `npm run db:generate`, apply
via `db:init`. Covers: `stagedFor` column + partial unique index + `stagedFor`
index, status enum value change, `entry_preview_tokens` table, and a data
backfill `UPDATE entries SET status='unpublished' WHERE status='draft'` (+ same
for `entry_versions`).

## Implementation workstreams

Sequenced; each is independently mergeable behind the previous.

- **WS0 — Status rename `draft`→`unpublished`.** Type, schema enum + default,
  ~22 literals (`service.ts` ×5, `built-in.ts`, `visibility.ts`,
  jobs/`scheduled-publish`+`trash-purge`, admin `PublishPanel`/`status-variant`/
  `entry-edit-page`/`entries-list-page`/`use-entry-form`/`_protected/index`,
  `badge`), i18n, tests + data migration. Foundational; ships alone.
- **WS1 — Schema + capability.** `stagedFor`, partial unique index, list filter,
  `entry_preview_tokens`, `staging` capability + `resolveEntryCapabilities` +
  config types; migration.
- **WS2 — Staging service.** `createStaged`/`getStaged`/`mergeStaged`/
  `deleteStaged` + `StagedEntryExistsError`, relation copy, conditional backup,
  transaction, `staging`+built-in assertions.
- **WS3 — Preview.** Token issue/revoke + hashed verify; `previewToken`/`staged`
  on `get`/`query`; visibility preview mode; 404 semantics.
- **WS4 — Transport/manifest/client/SDK.** HTTP routes + client + manifest +
  types for all new methods and the preview params.
- **WS5 — Admin.** Own-URL staged editor + banner + Current|Staged toggle,
  list exclusion, Stage/Merge/Discard actions + hooks, `createStaged`-error
  redirect, status UI, "revisions"→"versions" rename.
- **WS6 — Docs (at ship).** Update `TERMINOLOGY.md` (status values, add staged
  entry / preview token / version-vs-staged), move roadmap file to `completed/`,
  delete this spec.

## Gate (per `ARCHITECTURE.md`)

`npm run typecheck` · `test:run` · `build` (watch DTS OOM) · `lint:deps` ·
`db:generate` reports no unexpected drift after the migration is committed. Plus
browser-verify the admin staging flow (memory `project_browser_verification`).

## Scope

- **v1:** entries only; built-in storage; manual merge; token preview.
- **Deferred:** scheduled merge (`mergeAt` + CRON); 3-way merge; table-backed
  staging; staging for settings/menus; named/parallel multiple staged entries.
