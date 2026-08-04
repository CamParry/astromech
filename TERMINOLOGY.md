# Astromech — Terminology Reference

Terms that are ambiguous, easily confused, or have meaningful design decisions behind their naming.

Names here are chosen from established web-ecosystem vocabulary wherever one
fits, and a term that already means something specific to a web developer is not
reused for something else — see `decisions/0005-ai-context-naming.md`.

Each entry says what a term means today. Why it beat the alternative is in
`decisions/`, linked from the entry.

---

## Driver

The standard term for any pluggable backend implementation in Astromech. A driver knows how to communicate with a specific external system and exposes a consistent interface.

Current drivers:

- **DatabaseDriver** — wraps a database connection (`libsqlDriver`)
- **StorageDriver** — wraps a file storage backend (`filesystem()`, `r2()`, `s3()`)
- **EmailDriver** — wraps an email sending service (`SmtpDriver`, `ResendDriver`, `ConsoleDriver`)

Storage drivers are factories on their own subpaths (`astromech/storage/r2`),
never classes on the root barrel — see `apps/docs/configuration/storage.md`.

An **adapter** is a different thing: it reshapes one internal interface into another, as `tableStorage` reshapes a plugin table into `EntryStorage`. A driver reaches an external system. `decisions/0012-driver-not-adapter.md` records why the two words are kept apart.

---

## Entry type vs EntryTypeConfig

**Entry type** refers to the concept — a named content type (e.g. "posts", "products"). It is identified by its string name throughout the API.

**`EntryTypeConfig`** is the configuration object that defines an entry type: its field groups, slug rules, admin columns, etc. (`packages/astromech/src/types/config.ts`).

Prefer "entry type config" when referring to the config object in conversation, to avoid ambiguity.

---

## Entry vs Record

**Entry** is the Astromech term for a single content item stored in a collection. Avoid saying "record" — it conflates CMS content with raw database rows.

---

## Entry vs Table (as data worlds)

**Entry** — the built-in content unit, on the fixed core schema, with the full feature set available to it (statuses, slug, versions, staging, trash, translation, preview, relationships).

**Table** — a plugin-defined custom table (redirects, logs) on its own schema and its own storage. A table-backed type reaches the admin through `tableStorage`, an `EntryStorage` adapter that declares `supports: []`, so all entry chrome switches off.

The two are separate internally and share only the admin surface. `supports` gates behaviour and UI, **never** schema — toggling one needs no migration, and storage is always full.

Note the neighbouring clash: `<domain>/storage/` is DB access; top-level `storage/` is media binary/blob drivers. Different concepts.

---

## Trash vs Delete

These are distinct operations on the entries service:

- **`trash()`** (soft delete) — sets `deletedAt` on the entry; the row is preserved.
- **`delete()`** — **permanent**. Removes the row and its `relationships` rows outright.
- **`emptyTrash()`** — permanently deletes every trashed entry of a type in one go (also cleans up their `relationships` rows first).
- **Restore** — clears `deletedAt`, returning a trashed entry to active status.

`trash()` and `delete()` are two separate, named methods — there is no `forceDelete()`.

---

## Populated record

**There is no populate mechanism.** A relationship field reads back as the IDs stored in the field data; resolving those into whole entries is the caller's job, in a second read. Field data is the source of truth, so there is nothing to resolve _from_ the index — `decisions/0004-relationships-as-a-derived-index.md` has the reasoning.

The term survives only in a validation message: a **populated record** is an entry object sent where an ID belongs, which is what a caller writing back an expanded read produces. `relationship` and `media` reject it — `Must be an id, not a populated record`, or `Must be a list of ids, …` on a `multiple` field — rather than accept it silently.

---

## Publish / Schedule / Unpublished

The three values of `EntryStatus`:

- `unpublished` — not publicly visible
- `published` — live
- `scheduled` — will transition to published at `publishAt` time

`scheduled` is a status value with no enforcement behind it: nothing performs the
transition. See `roadmap/completed/versioning-publishing-scheduling.md`.

---

## Versioning

Per-entry-type opt-in via `EntryTypeConfig.versioning: true`. When enabled, a snapshot of the entry's fields and status is saved to the `entry_versions` table on each update.

The table always exists in the schema regardless of whether any entry type enables versioning.

This is **backward versioning** — an immutable, append-only record of the past. Contrast it with a **staged entry** (below), which is a mutable, prepared _future_ change. The two are distinct and do not unify: a **version** is a past snapshot for record-keeping; a **staged entry** is a forthcoming change you prepare, preview, and merge on purpose.

---

## Staged entry (forward versioning)

A **staged entry** is a separate, fully-editable `entries` row that holds the next version of an already-live entry without touching the live one — you prepare it, preview it, then merge it deliberately (rather than Astromech's default of editing live in place).

- It links to its **canonical** entry via the nullable `stagedFor` FK (`stagedFor IS NULL` ⇒ canonical; non-null ⇒ staged). It reuses all entry machinery (fields, validation, its own preview) and gets a **fresh `localeGroup`** — `stagedFor` is the only link.
- It shares the canonical's slug (staged rows are excluded from the slug unique index and from entry lists) and is always `unpublished`.
- Enabled per-type by the **`staging`** capability — default off, **independent of `versioning`**, built-in storage only.
- Service ops (all keyed off the **canonical** id): `createStaged` (throws `StagedEntryExistsError` carrying the existing staged id — one staged change per canonical), `getStaged`, `mergeStaged`, `deleteStaged`.
- **Merge** = backup (only if `versioning`) → update the canonical in place (id + slug preserved) with the staged content → hard-delete the staged row. Merge is **content-only**: it does not change the canonical's status (publishing stays a separate action). Staged entries are never trashed — discard and merge-cleanup both hard-delete.

---

## Preview token

A secret that authorizes reading an entry through the **publish/schedule gate** on its normal public slug route — used to review unpublished or staged content before it goes live.

- One token per canonical entry; the plaintext is returned **once** on issue and only its **hash** is stored (`entry_preview_tokens`); revocable; optional TTL.
- The token only **authorizes** (bypasses the publish/schedule gate, returning the **public** shape — never `full`); URL selectors pick the layer: `?preview=<token>` previews the current entry, `&staged=1` previews its staged change.
- An invalid or absent token falls back to normal public behaviour → non-published content returns nothing → 404 (no existence hints).

---

## adminRoute (config) vs Admin Routes (SPA pages)

`adminRoute` in `AstromechConfig` is a **string** — the URL prefix for the admin panel (default: `"/admin"`).

"Admin routes" (or "admin pages") refers to the **pages registered in the SPA** — either built-in pages (collections, media, users, settings) or plugin-contributed pages via the `admin:registerRoutes` hook.

These are different concepts that share a name. When speaking about the SPA extension mechanism, prefer "admin pages" to avoid confusion.

An **admin slot** is distinct from an admin page: a named mount point in the admin shell (`toolbar`, `right-drawer`, `global-overlay`) for **persistent chrome** that lives outside any single page. Plugins contribute components via `admin.slots`. A page is a routed destination; a slot is always-present UI.

---

## Relation vs Relationship

**Relation** — a field type (`'relationship'`) on an entry type that links an entry to one or more entries (or users) in another type. Authored with `fields.relationship(name, { target, multiple })`.

**Relationship** — the row in the `relationships` table recording one source→target edge, keyed on a composite primary key over `(sourceId, sourceKind, instancePath, targetId, targetKind)`. There is no `name` and no `position` column: ordering lives in field data and nowhere else.

A single relation field definition can produce many relationship rows.

**Field data is the source of truth; the `relationships` table is a derived, rebuildable index.** It is read for exactly three things — reverse lookup, filter-by-relation (`where: { references: … }`), and delete-time information — and never for a forward read. `astromech index:rebuild` regenerates it from field data; `--check` reports drift without writing. Why it is built this way, and the alternatives rejected, are in `decisions/0004-relationships-as-a-derived-index.md`.

Each row carries two paths, and the distinction matters:

- **Schema path** — the shape a query matches against (`sections[].gallery`). Indexed, derived from the type definitions.
- **Instance path** — where the edge actually sits in one entry's data (`sections[a1].gallery`, addressing items by their persisted `_id`). Stored, never pattern-matched.

Note also that `col.reference()` in the descriptor layer means a real foreign key and is a **different** thing from a content relationship. Don't conflate them.

---

## Backup run vs Backup artifact

**Backup run** — a row in `plugin_backups_runs`. Always present; records the outcome (`success`/`failed`/`running`) and trigger (`scheduled`/`manual`/`pre-restore`). Rows are never hard-deleted (manual delete marks `artifactDeletedAt` only).

**Backup artifact** — the stored `.sqlite.gz` file in plugin-scoped storage. A run only has an artifact if it succeeded; the artifact may be pruned by retention while the run row persists.

---

## Restore (backups)

A full-DB rollback performed by `@astromech/backups`: replaces all user tables from a backup artifact using `ATTACH` + a transactional per-table copy. **Preserves** the two operational tables (`plugin_backups_runs` and `_astromech_cron`) so the scheduler and run history survive the restore. Requires the backup's schema to match the live schema (fails loudly otherwise). Always preceded by an automatic `pre-restore` safety snapshot.

Not to be confused with **Restore** (entries) — clearing `deletedAt` on a trashed entry.

---

## Rotation / retention (backups)

After each successful backup, the plugin prunes the oldest artifacts so that at most N are retained (default 7, configurable). Pruned artifacts are deleted from storage and their run rows are marked with `artifactDeletedAt` — the row itself is kept so run history remains intact. `pre-restore` snapshots are currently counted toward the keep-N limit (excluded count is a backlog item).

---

## Merge tag vs Placeholder (forms)

**Merge tag** — a `{{token}}` an author writes into a form notification's recipient, subject or body, substituted with that submission's values at send time (`notifications/merge-tags.ts` in `@astromech/forms`). `{{fieldName}}`, plus `{{formTitle}}` and `{{submittedAt}}`. Unknown tags are left visible rather than silently deleted. The term is the form world's own — Gravity Forms, Mailchimp.

**Placeholder** — a form field's greyed-out input hint, stored as the `placeholder` key on a field block. Never means `{{token}}`; `decisions/0001-forms-vocabulary-and-table-directories.md` records the split.

---

## Notification (forms)

One message an editor configures to be sent when a submission is accepted, stored as a block instance on the form's `notifications` field. The block's kind (`_type`) selects the **notification provider** that delivers it — `email` is the only built-in. There is no separate "confirmation": an email notification addressed to a literal address is a site notification, one addressed to a merge tag such as `{{email}}` is a confirmation to the submitter, and nothing in the code distinguishes them.

---

## Schema vs Tables

**Tables** — a directory of `defineTable` / `definePluginTable` descriptors and nothing else. Every table-bearing plugin keeps its descriptors in `src/tables/`, publishes them (where a consumer needs them) as a `./tables` subpath, and `astromech plugin:generate --tables` reads that module to diff against the package's migration snapshot. A descriptor export is named `<noun>Table` (`entriesTable`, `cronTable`, `submissionsTable`) — the noun matching its SQL table name, the suffix separating it from the domain word and the domain's service.

**Schema** — the aggregate shape, or a module that mixes descriptors with validation. Core's `<domain>/schema.ts` holds both table descriptors and the domain's Zod request schemas, so it keeps the wider word; likewise `astromech/db/schema` (every table plus the codec and driver) and `@astromech/schema-engine` (diffing and rendering DDL). A `schema` that means "just these tables" is the one usage this vocabulary rules out — `decisions/0001-forms-vocabulary-and-table-directories.md` has the reasoning.

---

## AI context

What an admin route declares about the thing the user is currently looking at, so a model can resolve "this page" or "this field". A route contributes an `AIContextReference` (`{ kind, type?, id?, label }`) via `useAIContext`; the chat drawer assembles the current ordered set into a `role: 'system'` message inside `messages[]` — never into the system prompt, which would invalidate the prompt cache on every navigation.

Contributions are ordered, not a flat set: a layout, its route and a focused field editor can all contribute at once, and order is what decides which one "this" refers to.

Distinct from **React context**, which is a rendering mechanism and unrelated. The `AI` prefix is load-bearing — bare "context" in this codebase means React's, and "context bus" would mean an `emit`/`subscribe` event bus, which this is not. `decisions/0005-ai-context-naming.md` records the names rejected.

---

## Tool definition vs MCP tool

A **`ToolDefinition`** is one manifest method projected into a model-callable tool: its name, description, input schema, annotations, declared permission, and an `invoke` that resolves the service method at call time. It is transport-agnostic, which is why it lives in `packages/astromech/src/transport/tools/` and is shared by the MCP server and the AI tool-loop. `buildScopedDispatch` produces the one an untrusted caller must use, resolved through `scopedServices` so every call is checked against the caller's role.

**`McpToolDef`** in `packages/astromech/src/transport/mcp/tools.ts` is the MCP wire shape, built from a `ToolDefinition` when that transport serves one. The two are deliberately separate types: one is what a tool is here, the other is what a particular protocol expects to receive.

`decisions/0014-naming-the-ai-tool-surface.md` records why the definition is not called a dispatch, and `decisions/0008-plugin-methods-port.md` why the scoped builder is a separate function.
