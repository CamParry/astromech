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
} from './model';
export { serializeSnapshot } from './model';
export { capIdentifier, hash8, isAscii, MAX_IDENTIFIER_BYTES } from './identifiers';
export {
    foreignKeyName,
    renderColumnClause,
    renderCreateIndex,
    renderCreateTable,
    renderLiteral,
    renderTableStatements,
} from './ddl';
export { diffSnapshots } from './diff';
export type { DiffResult, TableOp } from './diff';
export { renderMigrationFile, renderOpStatements } from './render';
export { migrateToLatest, mergeMigrationProviders } from './apply';
export { dumpSchema } from './oracle';
export type { SchemaRow } from './oracle';
