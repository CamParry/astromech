# Schema-engine extraction handoff — `@astromech/schema-engine` workspace package

Implementation handoff for the coding agent. This is a **pure move-and-rewire refactor** — zero
behavior change, zero migration churn. The proof of success is mechanical: every gate green, and
`apps/demo/migrations/` **byte-identical** after `db:generate` (it must print `no-changes` and
`git diff --exit-code apps/demo/migrations/` must pass).

**Branch:** `feat/schema-engine-extraction`, forked from `main` (NOT from
`feat/data-layer-step5-plugin-factory` — step 5 is on hold and restarts on top of this after
merge). Verify with `git rev-parse --abbrev-ref HEAD` before every commit. Hooks stay ON — never
`--no-verify`.

**Why:** the migration engine (`snapshot model → DDL → diff → rendered migration files → apply`)
is already CMS-agnostic below the descriptor layer. Extracting it into its own package with a
strict public API makes the boundary structural instead of conventional: internals become
unimportable, the engine gets its own dedicated test suite and README, and the CMS keeps only
the thin descriptor→snapshot conversion it genuinely owns.

## Context you must know before touching code

- Paths relative to `packages/astromech/src/` unless prefixed otherwise.
- The engine modules today: `database/ddl.ts`, `snapshot.ts`, `diff.ts`, `migration-render.ts`,
  `generator.ts`, `migrator.ts`. Production importers are exactly three files: `kernel/boot.ts`
  and `transport/cli/commands/db-init.ts` (both use `migrator.ts`), and
  `transport/cli/commands/db-generate.ts` (uses `generator.ts`). Plus `tests/_support/harness.ts`
  (`migrator.ts`). Grep to confirm nothing new appeared before you start.
- **`snapshot.json` byte-parity is the hard constraint.** The wire format keeps the field names
  `kind` and `key` on columns — in the package they become _opaque_ `string`s (compared for
  equality, never interpreted). Do NOT rename snapshot fields, change key ordering, or alter
  `serializeSnapshot` — any format change makes the differ see every column as changed.
- kysely must stay a **single deduped copy** (better-auth pins 0.28.x). The package declares
  kysely as a peerDependency; `@libsql/*` only as devDependencies for its own tests. The
  `LibsqlDialect({ client: client as never })` cast is required at every LibsqlDialect site
  (@libsql/core version skew).
- Tests: `:memory:` dbs are poisoned after a storage transaction — the engine package's tests
  don't hit storage transactions, so `:memory:` is fine THERE; CMS-side tests keep their
  existing db strategy. `npm run test:run` skips tsc — always run `npm run typecheck` too.
  Baseline: 864 passing tests, `lint:deps` baseline 9 errors + 5 circular warnings (zero NEW).
- Root build DTS can OOM — `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.

## A) Package scaffold — `packages/schema-engine/`

Mirror `packages/plugins/redirects/package.json` conventions (tsup, dist, `files`, MIT,
`sideEffects: false`):

```jsonc
{
    "name": "@astromech/schema-engine",
    "version": "0.1.0",
    "type": "module",
    "description": "Schema-as-state migration engine for SQLite: snapshot in — DDL, diffs, and forward-only Kysely migration files out.",
    "exports": {
        ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
        "./generate": {
            "types": "./dist/generate.d.ts",
            "default": "./dist/generate.js",
        },
    },
    "peerDependencies": { "kysely": "*" },
    "devDependencies": {
        /* kysely, @libsql/client, @libsql/kysely-libsql, tsup, typescript, vitest — same versions as packages/astromech */
    },
}
```

- The `.` / `./generate` split is load-bearing: `.` is pure + edge/D1-safe (no `node:fs`);
  `./generate` is Node-only (dev/CI). This replaces the old "never barrel-export `generator.ts`"
  comment-convention with an enforced export map.
- `tsup.config.ts`: two entries (`src/index.ts`, `src/generate.ts`), dts on, esm only — copy the
  redirects config shape.
- Own `tsconfig.json` (mirror redirects), own `vitest.config.ts` (no aliases needed), own
  `eslint` wiring identical to how `packages/astromech` runs lint (reuse the repo's shared
  config; `"lint": "eslint src"`).
- `README.md` — one page, and it must state the engine's **contract**, not Astromech's usage:
  the Snapshot model; the three locked policies (forward-only / no `down()`; no renames —
  drop+create is the model; SQLite changed-table = full rebuild via
  `defer_foreign_keys → CREATE __new → INSERT…SELECT (COALESCE backfill) → DROP → RENAME`);
  journal ordered by `idx` alone (`when` informational); generation refuses to write on any
  validation error; the `dumpSchema` oracle as the parity primitive. No Astromech-specific
  wording anywhere in the package.
- Add the workspace: root `package.json` `workspaces` already covers `packages/plugins/*` but
  NOT `packages/schema-engine` — add `"packages/schema-engine"` to the workspaces array. Root
  `build` script: build it FIRST (`npm run build -w @astromech/schema-engine && …existing…`).
  Root `typecheck`/`lint`/`test:run`: extend to also run the new workspace (same
  `npm run <script> -w` chaining style as `build`).

## B) Move the engine modules → `packages/schema-engine/src/`

| From (`src/database/`)                                  | To (`src/`)           | Changes beyond import paths                                                                             |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `ddl.ts` (types + renderers ONLY)                       | `model.ts` + `ddl.ts` | See below — the descriptor half does NOT move                                                           |
| `snapshot.ts` (`serializeSnapshot` only)                | `model.ts`            | `createSnapshot` does NOT move (descriptor-facing)                                                      |
| `diff.ts`                                               | `diff.ts`             | Verbatim; strip `[Astromech] ` from error strings (neutral engine — callers brand)                      |
| `migration-render.ts`                                   | `render.ts`           | Verbatim                                                                                                |
| `generator.ts`                                          | `generate.ts`         | Signature change — see below                                                                            |
| `migrator.ts`                                           | `apply.ts`            | Generic over the DB type — see below                                                                    |
| (extracted from `tests/db/baseline-ddl-parity.test.ts`) | `oracle.ts`           | NEW — see below                                                                                         |
| NEW                                                     | `index.ts`            | Barrel: model + ddl + diff + render + apply + oracle. `generate.ts` is NOT in the barrel — subpath only |

**`model.ts`** — the Snapshot types move here from `ddl.ts:53-89`, with two type widenings that
keep the JSON identical while deleting the CMS type imports:

- `SnapshotColumn.kind: ColumnKind` → `kind?: string` and `key: string` → `key?: string` —
  opaque caller tags, doc-commented as "equality-compared (a change forces a rebuild), never
  interpreted".
- `SnapshotForeignKey.onDelete: OnDelete` → `onDelete: string`.
- `SqlDialect` ( = `'sqlite'`) and `serializeSnapshot` live here too.

**`ddl.ts`** — renderers only: `renderLiteral`, `renderColumnClause`, `renderCreateTable`,
`renderCreateIndex`, plus NEW convenience `renderTableStatements(table: SnapshotTable): string[]`
(CREATE TABLE + its indexes — the snapshot-shaped equivalent of the old `emitTableStatements`).
One required edit in `renderColumnClause`: the enum CHECK currently keys off
`col.kind === 'enum' && col.enumValues !== undefined` — change to `col.enumValues !== undefined`
alone (behavior-identical: only enum columns ever carry `enumValues`; this removes the last
semantic read of `kind`). `quoteLiteral`/`renderForeignKeyClause` stay internal (unexported).

The following do NOT move — they are descriptor-facing and go to the CMS side (§C):
`toSnakeCase`, `SQLITE_STORAGE_TYPE`/`columnType`, `resolveReferenceTarget`,
`synthesizedIndexes`/`allIndexes`, `descriptorToSnapshotTable`, `emitCreateTable`,
`emitCreateIndexes`, `emitTableStatements`, `createSnapshot`.

**`generate.ts`** — `generateMigrations(opts)` changes input: `tables: TableDescriptor[]` →
`snapshot: Snapshot` (the caller converts; the `createSnapshot` call inside is deleted). Also:
remove the `console.warn` loop — warnings are already in the return value; printing is the
caller's job. Neutralize the `[Astromech]` error prefix. Everything else (journal by `idx`,
`renderIndexFile`, tag naming, refuse-on-errors) verbatim.

**`apply.ts`** — `migrateToLatest<T>(db: Kysely<T>, provider: MigrationProvider)` (generic
replaces the CMS `DB` type import). Neutralize the `[Astromech]` error prefix.

**`oracle.ts`** — NEW, the shared parity primitive. Extract from
`tests/db/baseline-ddl-parity.test.ts` (its `masterRows` + `normalize`):

```ts
export type SchemaRow = {
    type: 'table' | 'index';
    name: string;
    tblName: string;
    sql: string;
};
/** Whitespace-normalized sqlite_master dump, ordered by (type, tblName, name).
 *  `tables` filters to those tbl_names; omitted = every non-internal table. */
export function dumpSchema<T>(
    db: Kysely<T>,
    opts?: { tables?: string[] }
): Promise<SchemaRow[]>;
```

Escape table names in the generated `IN (…)` list via `''`-doubling (the existing test
interpolates raw — fix that while extracting). Exclude `sqlite_*` internal rows and NULL-sql
rows (auto-indexes).

## C) CMS side — what `src/database/` keeps

**NEW `database/descriptor-snapshot.ts`** — the relocated descriptor→snapshot half of the old
`ddl.ts`/`snapshot.ts`, importing types from `@astromech/schema-engine`: `toSnakeCase`,
`columnType`, `resolveReferenceTarget`, `allIndexes`, `descriptorToSnapshotTable`,
`createSnapshot`, and the descriptor-in emit wrappers `emitCreateTable`/`emitCreateIndexes`/
`emitTableStatements` (now one-liners composing `descriptorToSnapshotTable` +
`renderCreateTable`/`renderCreateIndex`/`renderTableStatements`). Re-export the `Snapshot*`
types + `SqlDialect` from the package (type-only re-export) so CMS-side consumers keep one
import home. `descriptorToSnapshotTable` continues to write `kind` and `key` — snapshot output
must stay byte-identical.

**NEW `database/generate.ts`** — Node-only wrapper preserving the OLD signature so callers and
the step-5 plan stay stable:

```ts
export async function generateMigrations(opts: {
    dir: string;
    tables: TableDescriptor[];
    dialect: SqlDialect;
    name: string;
}): Promise<GenerateResult> {
    const snapshot = createSnapshot(opts.tables, { dialect: opts.dialect });
    const result = await engineGenerate({ ...opts, snapshot }); // from '@astromech/schema-engine/generate'
    for (const w of result.status === 'generated' ? result.warnings : [])
        console.warn(`[astromech db:generate] WARNING: ${w}`);
    return result;
}
```

Same rule as the old `generator.ts`: never re-export from `database/index.ts` or
`exports/schema.ts` (fs-free barrels).

**DELETE** `database/ddl.ts`, `snapshot.ts`, `diff.ts`, `migration-render.ts`, `generator.ts`,
`migrator.ts`.

**`packages/astromech/package.json`**: add `"@astromech/schema-engine": "*"` to `dependencies`
(workspace-resolved; changesets version it at release). tsup treats deps as external — no
config change expected, but verify the built `dist` imports the bare specifier.

**Resolution wiring** (so tests/typecheck don't require a pre-built dist):

- `packages/astromech/vitest.config.ts`: alias `@astromech/schema-engine/generate` →
  `../schema-engine/src/generate.ts` and `@astromech/schema-engine` → `../schema-engine/src/index.ts`
  (subpath alias FIRST — longest match must win; same pattern as the existing
  `astromech/*` aliases).
- `packages/astromech/tsconfig.json` (and `tsconfig.test.json` if paths don't inherit): `paths`
  entries for both specifiers → the package's `src`. If `lint:deps` (dependency-cruiser,
  `tsPreCompilationDeps: true`) starts resolving into `../schema-engine/src` and flags
  anything, scope the exclusion — zero NEW errors vs baseline is the bar.

## D) Rewire the four call sites

1. `kernel/boot.ts` — `import { migrateToLatest } from '@astromech/schema-engine'`. boot.ts must
   stay service-free (no `virtual:astromech/config` transitively) — the package import is plain
   and safe, but re-run the demo config-load check mentally: no new domain-service imports.
2. `transport/cli/commands/db-init.ts` — same import change.
3. `transport/cli/commands/db-generate.ts` — `import { generateMigrations } from
'@/database/generate.js'` (CMS wrapper; call shape unchanged).
4. `tests/_support/harness.ts` — `migrateToLatest` from the package.

## E) Test split

**Move to `packages/schema-engine/tests/`** (they become the package's dedicated suite; a
package test file must never import from `astromech` — inputs become plain `Snapshot`/
`SnapshotTable` literals, built via a small local `tests/_support/tables.ts` helper if repetition
warrants):

- `tests/db/diff.test.ts` → `diff.test.ts` — replace `createSnapshot(descriptors…)` fixtures
  with snapshot literals mirroring what the conversion produced; update the error-message
  assertions that expected `[Astromech] `.
- `tests/db/migration-render.test.ts` → `render.test.ts` — same fixture conversion.
- `tests/db/generator.test.ts` → `generate.test.ts` — pass `snapshot:` instead of `tables:`;
  temp-dir fs assertions unchanged.
- The renderer halves of `tests/db/ddl.test.ts` (renderCreateTable/renderCreateIndex/
  renderColumnClause/renderLiteral cases) → `ddl.test.ts`.
- NEW `oracle.test.ts` — `dumpSchema` on a tiny in-memory db: normalization, table filter,
  quote-escaping, internal-row exclusion.
- NEW `apply.test.ts` — `migrateToLatest` applies a two-migration provider to a temp db;
  failure surfaces the migration name.

**Stay in `packages/astromech/tests/db/`** (they test the CMS's descriptors and app chain):

- `drift.test.ts` — imports flip to `descriptor-snapshot.js` (`createSnapshot`, `Snapshot`
  type) + `diffSnapshots` from the package. Semantics identical.
- `baseline-ddl-parity.test.ts` — rewrite its `masterRows`/`normalize` to call the package's
  `dumpSchema` (one oracle everywhere); descriptor emit via `descriptor-snapshot.js`'s
  `emitTableStatements`.
- The descriptor-conversion halves of `ddl.test.ts` + `snapshot.test.ts` → merge into a renamed
  `descriptor-snapshot.test.ts` (`descriptorToSnapshotTable`, `createSnapshot` determinism,
  synthesized `<table>_<col>_unique` indexes, `toSnakeCase`, `resolveReferenceTarget`).
- `admin-meta.test.ts`, `cron-table.test.ts` — untouched.

Net test count must be ≥ 864 across both suites; nothing silently dropped.

## F) Gates — run ALL, in order, yourself

1. `npm run typecheck` (root — now covers both workspaces)
2. `npm run lint` (root)
3. `npm run test:run` (root) — both suites, zero failures
4. `npm run lint:deps` — zero NEW vs baseline (9 errors + 5 circular warnings)
5. `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (root — schema-engine builds first)
6. **Churn proof:** `npm run db:generate` → must print no-changes; then
   `git diff --exit-code apps/demo/migrations/` → clean. If either fails, the wire format
   drifted — fix the code, never regenerate artifacts.
7. Fresh-db proof: delete the demo db file, `npm run db:init`, seed — boots clean.
8. Demo smoke: root build already done; start dev server (port 4323), HTTP 200 on the admin
   login page (exercises boot's `migrateToLatest` from the package).

Commit (HEAD branch verified in the same command block):

```
refactor(data-layer): extract @astromech/schema-engine — agnostic snapshot/DDL/diff/migrate engine as a workspace package
```

Do NOT push, do NOT merge to main, do NOT touch `roadmap/` or the step-5 branch — the main
thread handles those after review.

## After this merges — step-5 handoff edits (main thread, not the coder agent)

`specs/data-layer-step5-handoff.md` needs these updates before the step-5 agent restarts:

- Context bullet: `generateMigrations` lives at `database/generate.ts` (same signature); the
  engine internals are `@astromech/schema-engine` and step 5 must consume ONLY its public API.
- §D (merged provider + `allowUnorderedMigrations`): implement `mergeMigrationProviders` and
  the `allowUnorderedMigrations` flag in the PACKAGE's `apply.ts` (they're generic engine
  features), re-exported to the CMS; `database/migrator.ts` no longer exists.
- §F (`plugin:generate`): calls the CMS `database/generate.ts` wrapper.
- Gate baselines: test count and any path references re-checked against post-extraction main.
