/**
 * `@astromech/schema-engine` — the pure, edge/D1-safe surface.
 *
 * Everything here is free of `node:fs`, so it is safe in a Worker or a browser
 * bundle. The Node-only generator (which reads and writes an app's
 * `migrations/` directory) is deliberately absent: import it from the
 * `@astromech/schema-engine/generate` subpath instead.
 */

export type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
    SqlDialect,
} from './model.js';
export { serializeSnapshot } from './model.js';
export {
    renderColumnClause,
    renderCreateIndex,
    renderCreateTable,
    renderLiteral,
    renderTableStatements,
} from './ddl.js';
export { diffSnapshots } from './diff.js';
export type { DiffResult, TableOp } from './diff.js';
export { renderMigrationFile, renderOpStatements } from './render.js';
export { migrateToLatest, mergeMigrationProviders } from './apply.js';
export { dumpSchema } from './oracle.js';
export type { SchemaRow } from './oracle.js';
