# The codec calls a column value "storage"

`TERMINOLOGY.md` says "**Storage.** File and blob storage only. Never database
access." The row codec breaks that rule 48 times, and it is the one place where
the word carries a third meaning that neither `decisions/0075-repository-for-data-access.md` nor the glossary
accounts for: the form a value takes in the column, as opposed to its JS form.

## What is actually true today

`packages/astromech/src/database/codec.ts` labels its two directions `JS → storage`
and `Storage → JS` on eight doc blocks.
`packages/astromech/src/database/define-table.ts` carries the word 24 times,
including a `storage:` key on every per-kind column config (`col.text`,
`col.integer`, `col.timestamp`, `col.json`, `col.enum`, …) and the `StorageData`
and `StorageCellBase` inference types that drive `TableSelect` / `TableInsert` /
`TableUpdate`.

The rest: `database/table-snapshot.ts` (`SQLITE_STORAGE_TYPE`, "the storage
column type a column renders to, per dialect"), `database/admin-meta.ts` ("Both
storage formats (ISO TEXT, unix-seconds INTEGER) carry time-of-day"),
`database/types.ts` ("the storage-shaped type surface for the query layer"),
`database/repository/create-repository.ts` ("Patch → storage cells"), and
`packages/schema-engine/src/diff.ts`, whose migration warning reads
`column "x" on table "y" storage type changed`.

None of this is wrong in isolation — "storage type" is ordinary database
vocabulary. It is wrong against our own glossary entry, and it is the only
remaining way a reader of `database/` can meet the word meaning something other
than S3.

## The candidate

**`encoded`**, because the module is already a codec and already exports
`encodeWith`, `decodeWith` and `encodePatchWith`. The two sides become "decoded"
(JS) and "encoded" (column), which is the local vocabulary rather than a new
one. `storage: string` becomes `encoded: string`; `StorageData` becomes
`EncodedData`; `JS → storage` becomes `JS → encoded`.

Rejected on sight: **`column`**, already taken by the column _declaration_, so
`column: string` on a `ColConfig` would be ambiguous with the thing it sits on.
**`driverParam`** is Drizzle's word for the same idea and would be defensible
prior art, but it reads wrong on a select cell, which is a value coming back.

## Why this is a record and not a cleanup

- `storage:` is on the public `ColConfig` shape, so a plugin declaring a custom
  column kind sees it. That makes it a breaking change for `definePluginTable`
  consumers, not an internal rename.
- The `schema-engine` warning is printed during migration generation, so the
  wording change is user-visible output.
- The inference chain (`StorageData` → `StorageCellBase` → `TableSelect`) is
  where a rename can go quietly wrong; it needs the type tests run, not just a
  typecheck.

## The work

- [ ] **Decide whether the third meaning is renamed or admitted.** Admitting it
      means a `TERMINOLOGY.md` entry saying "storage" also means the column form,
      which weakens the entry that exists to keep the word single-valued.
- [ ] **Pick the word** and record the comparison in `decisions/`, since it is
      contested. `decisions/0005-ai-context-naming.md` is the worked example.
- [ ] **Rename**, including `SQLITE_STORAGE_TYPE`, the `schema-engine` warning
      string, and the `StorageData` / `StorageCellBase` inference types.
- [ ] **Amend `TERMINOLOGY.md`** either way, so the glossary and the code agree.

## Not in scope

**The blob sense.** `src/storage/`, `StorageDriver`, `PluginStorage`,
`ctx.storage` and the `astromech/storage/*` subpaths keep the word. That is what
`decisions/0075-repository-for-data-access.md` reserved it for.
