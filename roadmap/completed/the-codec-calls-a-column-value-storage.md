# The codec calls a column value "storage"

**Shipped 2026-08-24.** `TERMINOLOGY.md` says "**Storage.** File and blob storage
only. Never database access", and `database/` used the word about thirty-five
times anyway. The third meaning was renamed rather than admitted to the glossary,
and reading the uses properly showed it was two meanings, not one, which is why
one replacement word would have been wrong.

- The value's form at the driver boundary is **`encoded`**: the phantom
  `storage:` key on `ColConfig`, `StorageData`, `StorageCellBase`, and the eight
  `JS → storage` / `Storage → JS` doc blocks in
  `packages/astromech/src/database/codec.ts`.
- The declared SQL column type is **`columnType`**: `SQLITE_STORAGE_TYPE` in
  `packages/astromech/src/database/table-snapshot.ts`, and the
  `packages/schema-engine/src/diff.ts` warning, now
  `column "x" on table "y" changed type (text → integer)`.

`decisions/0092-encoded-is-the-column-form-of-a-value.md` records the comparison,
including why `column` and Drizzle's `driverParam` lost.

## The work

- [x] **Decide whether the third meaning is renamed or admitted.** Renamed. A
      glossary entry that says "storage means blobs, and also this other thing"
      has stopped doing the job `decisions/0075-repository-for-data-access.md`
      gave it.
- [x] **Pick the word** and record the comparison in `decisions/`, since it is
      contested.
- [x] **Rename**, in both senses: `encoded` for the codec, `columnType` for the
      SQL type.
- [x] **Amend `TERMINOLOGY.md`**, which gains an **Encoded** entry and points
      **Storage** at it.

## Two things the plan had wrong

**The breaking-change reasoning.** The plan said `storage:` sits "on the public
`ColConfig` shape, so a plugin declaring a custom column kind sees it".
`ColConfig`, `StorageData` and `StorageCellBase` were all module-private, so no
consumer could import any of them. The key was public surface for a different
reason: `Column` is exported from `exports/index.ts` and tsup inlines its phantom
config structurally into every published plugin declaration file, so
`packages/plugins/assistant/dist/tables.d.ts` carried `storage:` per column.
Rebuilding the plugins was therefore part of the change.

**The grouping.** The plan named `SQLITE_STORAGE_TYPE` and its doc comment in
`table-snapshot.ts` correctly, but filed them under the same rename as the codec
sense. They are the second sense and take `columnType`.

## Not in scope

**The blob sense.** `src/storage/`, `StorageDriver`, `PluginStorage`,
`ctx.storage` and the `astromech/storage/*` subpaths keep the word. That is what
`decisions/0075-repository-for-data-access.md` reserved it for.
