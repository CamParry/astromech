# Astromech — Terminology Reference

Terms that are ambiguous, easily confused, or have meaningful design decisions behind their naming.

---

## Driver

The standard term for any pluggable backend implementation in Astromech. A driver knows how to communicate with a specific external system and exposes a consistent interface.

Current drivers:

- **DatabaseDriver** — wraps a database connection (`libsqlDriver`, `d1Driver`)
- **StorageDriver** — wraps a file storage backend (`FilesystemStorage`, and future S3/R2 drivers)
- **EmailDriver** — wraps an email sending service (`SmtpDriver`, `ResendDriver`, `ConsoleDriver`)

> **Why "driver" and not "adapter"?** Both terms are used in the ecosystem (Payload uses "adapter", AdonisJS uses "driver"). We chose "driver" for consistency with `DatabaseDriver`, which was already established, and because it better conveys the idea of a low-level connector to a specific technology — not just a compatibility shim.

---

## Collection vs CollectionConfig

**Collection** refers to the concept — a named content type (e.g. "posts", "products"). It is identified by its string name throughout the API.

**CollectionConfig** is the configuration object that defines a collection: its field groups, slug rules, admin columns, etc.

Prefer "collection config" when referring to the config object in conversation, to avoid ambiguity.

---

## Entry vs Record

**Entry** is the Astromech term for a single content item stored in a collection. Avoid saying "record" — it conflates CMS content with raw database rows.

---

## Delete vs Trash vs Force Delete

These are distinct operations:

- **Trash** (soft delete) — sets `deletedAt` on the entry; the row is preserved. The API method is `delete()`.
- **Force delete** — permanently removes the row. The API method is `forceDelete()`.
- **Restore** — clears `deletedAt`, returning a trashed entry to active status.

> **Known ambiguity:** The API method `delete()` performs a soft delete (trash), which is non-obvious. A future API revision may rename this to `trash()` and make `delete()` a force delete. This has not been decided yet.

---

## Populate

The mechanism for resolving relation fields when fetching entries. Pass `populate: ['fieldName']` in query options to include related entries or media inline on the response rather than returning bare IDs.

Not to be confused with database-level joins — populate is resolved at the application layer via the relationships table.

---

## Publish / Schedule / Unpublished

The three values of `EntryStatus`:

- `unpublished` — not publicly visible (was `draft`)
- `published` — live
- `scheduled` — will transition to published at `publishAt` time (scheduling system not yet implemented — Phase 14)

`scheduled` currently exists as a status value but has no enforcement mechanism.

---

## Versioning

Per-collection opt-in via `CollectionConfig.versioning: true`. When enabled, a snapshot of the entry's fields and status is saved to the `entry_versions` table on each update.

The table always exists in the schema regardless of whether any collection enables versioning.

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

---

## Relation vs Relationship

**Relation** — a field type (`"relation"`) on a collection that links an entry to one or more entries in another collection. Defined in `CollectionConfig`.

**Relationship** — the database record in the `relationships` table that backs a relation field. Stores source, target, field name, and position.

A single relation field definition can produce many relationship records.

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
