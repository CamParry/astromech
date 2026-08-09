/**
 * Snapshot literal builders for the engine's tests.
 *
 * The engine takes snapshots, not schema definitions, so fixtures are plain
 * data. These helpers only exist to keep the repetition down — they add no
 * behaviour the engine relies on.
 */

import type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
} from '../../src/model';

type ColOpts = {
    notNull?: boolean;
    primaryKey?: boolean;
    default?: string | number;
    enumValues?: readonly string[];
};

function column(
    name: string,
    kind: string,
    type: 'text' | 'integer' | 'real',
    opts: ColOpts = {}
): SnapshotColumn {
    return {
        key: name,
        name,
        kind,
        type,
        notNull: opts.notNull ?? false,
        primaryKey: opts.primaryKey ?? false,
        ...(opts.default !== undefined && { default: opts.default }),
        ...(opts.enumValues !== undefined && { enumValues: opts.enumValues }),
    };
}

export const col = {
    id: (name = 'id'): SnapshotColumn =>
        column(name, 'id', 'text', { notNull: true, primaryKey: true }),
    text: (name: string, opts?: ColOpts): SnapshotColumn =>
        column(name, 'text', 'text', opts),
    integer: (name: string, opts?: ColOpts): SnapshotColumn =>
        column(name, 'integer', 'integer', opts),
    real: (name: string, opts?: ColOpts): SnapshotColumn =>
        column(name, 'real', 'real', opts),
    enum: (name: string, values: readonly string[], opts?: ColOpts): SnapshotColumn =>
        column(name, 'enum', 'text', { ...opts, enumValues: values }),
    reference: (name: string, opts?: ColOpts): SnapshotColumn =>
        column(name, 'reference', 'text', opts),
};

export function fk(
    column: string,
    targetTable: string,
    onDelete = 'no action',
    targetColumn = 'id'
): SnapshotForeignKey {
    return { column, targetTable, targetColumn, onDelete };
}

export function index(
    name: string,
    columns: string[],
    opts: { unique?: boolean; where?: string } = {}
): SnapshotIndex {
    return {
        name,
        columns,
        unique: opts.unique ?? false,
        ...(opts.where !== undefined && { where: opts.where }),
    };
}

export function table(
    name: string,
    columns: SnapshotColumn[],
    extra: {
        primaryKey?: string[];
        fks?: SnapshotForeignKey[];
        indexes?: SnapshotIndex[];
    } = {}
): SnapshotTable {
    return {
        name,
        columns,
        ...(extra.primaryKey !== undefined && { primaryKey: extra.primaryKey }),
        fks: extra.fks ?? [],
        indexes: extra.indexes ?? [],
    };
}

/** Assemble a snapshot from tables, keyed and sorted by name (the ordering a
 *  caller's snapshot builder is expected to produce). */
export function snap(...tables: SnapshotTable[]): Snapshot {
    const entries = tables
        .map((t): [string, SnapshotTable] => [t.name, t])
        .sort(([a], [b]) => a.localeCompare(b));
    return { version: 1, dialect: 'sqlite', tables: Object.fromEntries(entries) };
}
