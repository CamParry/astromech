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

## Publish / Schedule / Draft

The three values of `EntryStatus`:

- `draft` — not publicly visible
- `published` — live
- `scheduled` — will transition to published at `publishAt` time (scheduling system not yet implemented — Phase 14)

`scheduled` currently exists as a status value but has no enforcement mechanism.

---

## Versioning

Per-collection opt-in via `CollectionConfig.versioning: true`. When enabled, a snapshot of the entry's fields and status is saved to the `entry_versions` table on each update.

The table always exists in the schema regardless of whether any collection enables versioning.

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
