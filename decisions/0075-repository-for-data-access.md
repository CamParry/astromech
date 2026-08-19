# 0075 — `repository` for the data-access layer, `storage` for files

**Date:** 2026-08-20
**Status:** accepted
**Supersedes:** 0003 (the "no repository wrapper" naming point only)

## Context

`storage` named two unrelated things. The `Table`-backed CRUD wrappers
(`createStorage`, `createUserStorage`, `EntryStorage`, the per-domain
`storage.ts` files) were DB access. The drivers under `src/storage/`
(`filesystem`, `r2`, `s3`) were file/blob storage. `media/storage.ts` was DB
access; `storage/drivers/` was files. One word, two data worlds, sitting in the
same layer diagram.

`decisions/0003` refused a repository wrapper on two grounds: repositories
"pre-flatten the query surface and choke complex logic", and "every DB-touching
unit being called storage removes a distinction that was never carrying weight".
`decisions/0009` held the line, catching a stray `notificationsRepo` and calling
it a rule violation. The `code` skill wrote it as law: "No repository pattern …
Name `createXStorage`, never `XRepository`."

`roadmap/in-progress/naming-audit-renames.md` parked this rename as WS3 with the
right instruction: settle the data-layer question before touching a name written
in three places.

## What changed since 0003

0003's two grounds age differently.

The query-surface objection was against adding a **layer** — a repository that
narrows the query grammar and forces logic up out of it. This rename adds no
layer. `createRepository` returns the identical object `createStorage` did: the
same open `where` grammar, the same `query()` escape hatch, the same
factory-closing-over-a-db shape. Nothing is pre-flattened. That objection still
stands against the thing it named, and this is not that thing.

The distinction objection was a fair trade **only while `storage` had one
meaning**. It no longer does. The file drivers took the same word, so "DB unit"
and "file unit" now collide on it every time either is read. The distinction
0003 called weightless is exactly the one a reader now has to reconstruct from
the folder path. The trade inverted.

## Decision

`storage` means file storage. The data-access layer is `repository` — the word
TypeORM, Spring and DDD already use for a per-entity CRUD wrapper, and unused as
an identifier here before this record.

| Was                                                                                             | Now                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `createStorage` / `Storage<D>`                                                                  | `createRepository` / `Repository<D>`     |
| `database/storage/`                                                                             | `database/repository/`                   |
| `createUserStorage` / `UserStorage` (and cron, notifications, media, settings, plugin-tracking) | `create*Repository` / `*Repository`      |
| `entries/storage/`, `EntryStorage`                                                              | `entries/repository/`, `EntryRepository` |
| `tableStorage` / `TableStorage`                                                                 | `tableRepository` / `TableRepository`    |
| `get/setEntryStorage`, `hasEntryStorageOverride`, `resetEntryStorageOverrides`                  | `…EntryRepository…`                      |
| `EntryType.storage?:` config field                                                              | `EntryType.repository?:`                 |
| `EntryRecord`                                                                                   | `EntryRow`                               |

`EntryRecord` → `EntryRow` rides along because it was independently correct:
`TERMINOLOGY.md` already says avoid "record", and `Row` is the house suffix
(`RelationshipRow`, `CronRow`, `NotificationRow`).

## What was deliberately not renamed

- **The file/blob side keeps `storage`.** Top-level `src/storage/`,
  `StorageDriver`, `PluginStorage`, `ctx.storage`, the `r2`/`s3`/`filesystem`
  drivers, and the `astromech/storage/*` public subpaths. This rename exists to
  give that word back its single meaning, not to move it.
- **The per-entry-type persistence override stays.** `EntryRepository`'s
  pluggability (a type pointing at its own `Table` via `tableRepository`) is used
  by the redirects and forms plugins for their own tables, and collapsing it was
  already rejected in `roadmap/completed/entries-module-reshape.md`. Only the
  names changed; the seam is untouched.
- **The query-grammar types** — `Where`, `OrderBy`, `FindManyParams`, `Patch`,
  `UpsertOptions`, `QueryHandle`, `GenericDb` — were never "storage" and stay put.

## Rejected

- **`store`.** Too close to the surviving `storage`; the two would re-create the
  collision this record removes, one keystroke apart.
- **`persistence`.** Awkward in type names (`UserPersistence`, `EntryPersistence`)
  and longer without being clearer than the ecosystem's own word.
- **Keeping `storage` and renaming the file side to `blob/`.** Considered in WS3
  and inverted: "storage" is universally read as file storage, so the file side
  is the one with the stronger claim to keep it. Renaming the larger, better-known
  side to serve the smaller one is the worse trade.

## Consequences

- `createRepository`, `Repository`, `tableRepository` and the entries symbols are
  part of the public plugin API, and `EntryType.repository?:` is public config.
  Pre-1.0 with no external consumers, so the break is cheap now and expensive
  later — the reason to do it here.
- The `code` skill's "Data access" section is rewritten from the storage pattern
  to the repository pattern. `ARCHITECTURE.md` and `TERMINOLOGY.md` lose the
  `<domain>/storage/` vs `storage/` clash note, because different words now carry
  the two concepts.
- `decisions/0055` ("a tx-bound storage's `transaction()` throws") describes the
  same layer under its old name; its behaviour is unchanged.
