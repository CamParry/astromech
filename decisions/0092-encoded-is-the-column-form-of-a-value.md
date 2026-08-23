# 0092 — `encoded` is the column form of a value

**Date:** 2026-08-24
**Status:** accepted

`TERMINOLOGY.md` says "**Storage.** File and blob storage only. Never database
access." `decisions/0075-repository-for-data-access.md` reserved the word for
that, renaming every `createXStorage` to `createXRepository` so a reader meeting
"storage" in this codebase knows it means S3 or the filesystem.

`database/` never got that sweep, and it uses the word about thirty-five more
times. Reading them properly shows they are not one leftover meaning but two,
which is why a single replacement word would have been wrong.

## The two senses

**The value's form crossing the driver boundary.** A `Date` goes down as an ISO
string, an object as a JSON string, a boolean as `0`/`1`. This is the phantom
`storage` key on `ColConfig`, the `StorageData` and `StorageCellBase` inference
types that drive `KyselyOf<>`, and the eight `JS → storage` / `Storage → JS` doc
blocks in `database/codec.ts`.

**The declared SQL column type.** `SQLITE_STORAGE_TYPE` in
`database/table-snapshot.ts` maps each `ColumnKind` to `'text' | 'integer' |
'real'`, and `packages/schema-engine/src/diff.ts` warns `column "x" on table "y"
storage type changed` while comparing two snapshots' `type` fields.

## The first sense is `encoded`

`data`/`storage` becomes `data`/`encoded`; `DomainData`/`StorageData` becomes
`DomainData`/`EncodedData`; `StorageCellBase` becomes `EncodedCellBase`; the doc
blocks read `JS → encoded` and `encoded → JS`.

This is the module's own vocabulary rather than a new one. The file is called
`codec.ts` and its five exported functions are `encode`, `decode`, `encodeWith`,
`decodeWith` and `encodePatchWith`. A reader who has met `encodeWith` already
knows what an encoded value is; nothing has to be taught.

Two alternatives lost:

- **`column`** is already taken by the column _declaration_, the thing the key
  sits on. `column: string` inside a `ColConfig` would read as the column rather
  than as the form its value takes.
- **`driverParam`** is Drizzle's word for exactly this, and `ColConfig` is
  otherwise modelled on Drizzle's `ColumnBaseConfig` (`data`, `driverParam`,
  `notNull`, `hasDefault`), so the prior art is real and directly relevant. It
  loses because half the uses are select cells, values coming _back_ from the
  driver, and calling those a parameter reads backwards. `encoded` is
  directionless and covers both.

Admitting the sense instead, by adding it to the glossary, was the other way out.
It loses because the entry exists to keep the word single-valued; a glossary that
says "storage means blobs, and also this other thing" has stopped doing the job
0075 gave it.

## The second sense is `columnType`

`SQLITE_STORAGE_TYPE` becomes `SQLITE_COLUMN_TYPE`, and the diff warning becomes
`column "x" on table "y" changed type (text → integer)`. The obvious
substitution, "column type changed", would have printed the word twice; the
verb-last form also matches the `enum "x" on table "y" narrowed` warning beside
it.

This is not a coinage and barely a rename: the function the constant feeds is
already called `columnType`, and the values it prints are already the column's
`type` field. Only the constant and the warning string disagreed with their own
neighbours.

This sense was the defensible one. SQLite's specification calls `NULL`,
`INTEGER`, `REAL`, `TEXT` and `BLOB` storage classes, so "storage type" here was
correct database vocabulary, not sloppiness. It goes anyway, because the value of
0075's rule comes from having no exceptions: one surviving use in `database/` is
enough to make a reader wonder which meaning the next one carries.

## What keeps the word

- **`AsyncLocalStorage`** in `database/transaction.ts` is Node's API.
- **"Mirrors the storage registry pattern"** in `database/registry.ts` and
  `database/driver-registry.ts` points at `src/storage/registry.ts`, the blob
  registry. That is the reserved sense, used correctly.
- **Everything under `src/storage/`** — `StorageDriver`, `PluginStorage`,
  `ctx.storage`, the `astromech/storage/*` subpaths. That is what 0075 reserved
  it for.

## What this costs

`ColConfig`, `StorageData` and `StorageCellBase` are all module-private, so no
consumer can import the names. But `Column` is exported from
`exports/index.ts`, and tsup inlines its phantom config structurally into every
published plugin declaration file — `packages/plugins/assistant/dist/tables.d.ts`
holds `astromech.Column<{ … storage: … }>` for each of its columns. The key is
therefore public surface, and rebuilding the plugins is part of the change.

Nothing writes the key by hand today. `definePluginTable` infers it from
`col.text` and friends, so a plugin only meets it in generated output. A plugin
hand-writing a `Column<{ … }>` would break, which is a shape nothing in the repo
uses.

The inference chain (`EncodedData` → `EncodedCellBase` → `KyselyCell` →
`KyselyOf`) is where a rename of this kind goes quietly wrong, since a typo
resolves to `unknown` rather than failing. `pnpm run typecheck` covers it only
because `apps/demo` consumes the generated types the way a site does.
