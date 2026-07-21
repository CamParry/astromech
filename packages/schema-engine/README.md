# @astromech/schema-engine

Schema-as-state migration engine for SQLite. You hand it a **snapshot** — your
schema's DDL-affecting state as plain data — and it gives you DDL, a diff
against the previously generated snapshot, and forward-only Kysely migration
files.

The engine knows nothing about where your snapshot comes from. Building one is
the caller's job; the engine only ever compares snapshots for equality and
renders SQL from them.

```ts
import {
    diffSnapshots,
    renderMigrationFile,
    renderTableStatements,
} from '@astromech/schema-engine';
import { generateMigrations } from '@astromech/schema-engine/generate';
```

Two entry points, and the split is enforced by the export map:

- `.` — pure. No `node:fs`, safe on an edge runtime or in a browser bundle:
  the snapshot model, the DDL renderers, the differ, the migration-file
  renderer, the migration runner, and the schema oracle.
- `./generate` — Node-only. Reads and writes an app's `migrations/` directory.
  A dev/CI step, never a runtime one.

## The Snapshot model

A `Snapshot` is `{ version: 1, dialect, tables }`, where each table carries its
columns, foreign keys, and indexes:

```ts
type SnapshotColumn = {
    key?: string;
    name: string;
    kind?: string;
    type: 'text' | 'integer' | 'real';
    notNull: boolean;
    primaryKey: boolean;
    default?: string | number;
    enumValues?: readonly string[];
};
```

It must contain **exactly** what determines the shape on disk and nothing else.
The differ treats any change as a schema change, so caller-side facts that never
reach the DDL (application-level defaults, serializers, display metadata) will
generate spurious migrations if you include them.

`key` and `kind` are opaque caller tags. The engine compares them for equality —
a change forces a table rebuild — but never interprets them.

Table order, column order, and index order in a snapshot are preserved verbatim:
column order is what a rebuild's `INSERT…SELECT` mapping is built from, so it is
part of the contract, not an accident. `serializeSnapshot` is a plain stable
`JSON.stringify(snapshot, null, 2)`.

## Locked policies

**Forward-only. No `down()`.** A schema definition is _state_, not history.
Reverting a change means declaring the earlier state and generating a fresh
forward migration. Generated migration modules export `up(db)` and nothing else.

**No renames — drop and create is the model.** There is no rename detection and
no rename annotation. A column or table that disappears from the snapshot is
dropped; one that appears is created. Renaming without data loss is a
hand-authored migration.

**A changed table is rebuilt whole.** SQLite has no `ALTER COLUMN` / `DROP
COLUMN` that survives CHECK constraints and indexes, so any non-additive change
to a table produces one `rebuildTable` op covering every column, FK, and index
change on it:

```
PRAGMA defer_foreign_keys = true
CREATE TABLE `__new_x` (…)
INSERT INTO `__new_x` (…) SELECT … FROM `x`      -- COALESCE-backfilling nullable → NOT NULL
DROP TABLE `x`
ALTER TABLE `__new_x` RENAME TO `x`
CREATE INDEX …                                    -- every index recreated
```

No self-managed `BEGIN`/`COMMIT`: Kysely's `Migrator` already wraps each
migration in a transaction, and `defer_foreign_keys` is transaction-scoped.
Purely additive changes (a nullable column, or a NOT NULL column with a literal
default, that is not a primary key) fast-path to native `ALTER TABLE ADD COLUMN`
/ `CREATE INDEX` / `DROP INDEX` instead.

**The journal orders by `idx` alone.** `journal.json` records
`{ idx, tag, when }` per migration; `idx` is the sole ordering key and `when` is
informational. There is no `id`/`prevId` snapshot chain, so two people
generating in parallel get a `snapshot.json` merge conflict — visible and
resolvable — rather than a silent hash mismatch.

**Generation refuses to write on any validation error.** The differ collects
states it cannot express as errors: a new or newly-NOT-NULL column with no SQL
literal to backfill from, an index naming a column that does not exist, a
duplicate index name. If any exist, `generateMigrations` throws and writes
nothing at all — no partial migration, no advanced journal. Warnings (dropped
tables and columns, narrowed enums, changed storage types, new unique indexes)
are returned in the result for the caller to surface however it likes; the
engine never prints.

## The oracle

`dumpSchema(db, { tables? })` returns a whitespace-normalized `sqlite_master`
dump ordered by `(type, tblName, name)`, excluding internal `sqlite_*` and
implicit-index rows. It is the parity primitive: two databases built by
different routes — an applied migration chain versus a direct
`renderTableStatements` emit — are equivalent iff their `dumpSchema` output
matches. Use it as a drift gate in CI.

## License

MIT
