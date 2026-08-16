/**
 * Unit tests for `Table` → snapshot conversion
 * (`database/table-snapshot.ts`).
 *
 * Covers the `Table`-facing half: key/identifier casing, per-kind storage
 * types, FK target resolution (`Table` target, string target, self-ref
 * thunk), synthesized column-unique indexes, and `createSnapshot`'s shape,
 * determinism, and exclusion of app-side-only facts. SQL rendering itself lives
 * in `@astromech/schema-engine` and is tested there — the emit wrappers are
 * checked only for the `Table`→statement wiring.
 */

import { describe, expect, it } from 'vitest';
import { defineTable, type Table } from '@/database/define-table';
import {
    columnType,
    createSnapshot,
    toSnapshotTable,
    emitCreateIndexes,
    emitCreateTable,
    emitTableStatements,
    resolveReferenceTarget,
    toSnakeCase,
} from '@/database/table-snapshot';
import { serializeSnapshot } from '@astromech/schema-engine';
import { rolesTable } from '@/users/schema';
import { entriesTable, entryPreviewTokensTable } from '@/entries/schema';
import { relationshipsTable, cronTable } from '@/database/schema';

describe('toSnakeCase', () => {
    it('converts camelCase keys to snake_case identifiers', () => {
        expect(toSnakeCase('localeGroup')).toBe('locale_group');
        expect(toSnakeCase('id')).toBe('id');
        expect(toSnakeCase('isBuiltIn')).toBe('is_built_in');
    });
});

const kinds = defineTable('kinds', ({ col }) => ({
    id: col.id(),
    text: col.text(),
    integer: col.integer(),
    real: col.real(),
    boolean: col.boolean(),
    timestamp: col.timestamp(),
    json: col.json(),
    enum: col.enum(['a', 'b']),
    reference: col.reference('users'),
}));

describe('columnType', () => {
    it('maps every column kind to its sqlite storage type', () => {
        expect(columnType(kinds.columns.id, 'sqlite')).toBe('text');
        expect(columnType(kinds.columns.text, 'sqlite')).toBe('text');
        expect(columnType(kinds.columns.integer, 'sqlite')).toBe('integer');
        expect(columnType(kinds.columns.real, 'sqlite')).toBe('real');
        expect(columnType(kinds.columns.boolean, 'sqlite')).toBe('integer');
        expect(columnType(kinds.columns.timestamp, 'sqlite')).toBe('text');
        expect(columnType(kinds.columns.json, 'sqlite')).toBe('text');
        expect(columnType(kinds.columns.enum, 'sqlite')).toBe('text');
        expect(columnType(kinds.columns.reference, 'sqlite')).toBe('text');
    });
});

describe('toSnapshotTable timestamp storage', () => {
    it('renders a timestamp as a text column', () => {
        const snap = toSnapshotTable(kinds, 'sqlite');
        expect(snap.columns.find((c) => c.key === 'timestamp')?.type).toBe('text');
    });
});

// ============================================================================
// Fixtures
// ============================================================================

const parent = defineTable('parent', ({ col }) => ({
    id: col.id(),
    name: col.text({ notNull: true }),
}));

const orphan = defineTable('orphan', ({ col }) => ({
    name: col.text(),
}));

const child = defineTable(
    'child',
    ({ col }) => ({
        id: col.id(),
        parentId: col.reference(() => parent, { notNull: true, onDelete: 'cascade' }),
        ownerId: col.reference('users'),
        selfId: col.reference((): Table => child, { onDelete: 'no action' }),
        label: col.text({ unique: true }),
        count: col.integer({ default: 0 }),
        ratio: col.real({ default: 1.5 }),
        active: col.boolean({ notNull: true, default: true }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        status: col.enum(['a', 'b', "c'd"], { notNull: true, default: 'a' }),
        note: col.text({ default: "it's" }),
    }),
    ({ index }) => [
        index('idx_child_parent', ['parentId']),
        index('child_parent_label_unique', ['parentId', 'label'], {
            unique: true,
            where: 'label IS NOT NULL',
        }),
    ]
);

const edge = defineTable(
    'edge',
    ({ col }) => ({
        sourceId: col.text({ notNull: true }),
        targetKind: col.enum(['entry', 'user', 'media'], { notNull: true }),
        label: col.text(),
    }),
    {
        primaryKey: ['sourceId', 'targetKind'],
        indexes: ({ index }) => [index('idx_edge_label', ['label'])],
    }
);

describe('resolveReferenceTarget', () => {
    it('resolves a string target to {table, column: "id"}', () => {
        expect(resolveReferenceTarget('users')).toEqual({ table: 'users', column: 'id' });
    });

    it('resolves a `Table` target to its name + primary-key column', () => {
        expect(resolveReferenceTarget(parent)).toEqual({ table: 'parent', column: 'id' });
    });

    it('resolves a self-referencing thunk target', () => {
        const selfCol = child.columns.selfId;
        if (!selfCol.reference) throw new Error('expected selfId to carry a reference');
        expect(resolveReferenceTarget(selfCol.reference.target())).toEqual({
            table: 'child',
            column: 'id',
        });
    });

    it('throws for a `Table` target with no primary key', () => {
        expect(() => resolveReferenceTarget(orphan)).toThrow();
    });

    it('throws for a `Table` target with a composite primary key', () => {
        expect(() => resolveReferenceTarget(edge)).toThrow(/composite primary key/);
    });
});

describe('toSnapshotTable', () => {
    it('snake_cases column names while keeping the column key, in declaration order', () => {
        const snap = toSnapshotTable(child, 'sqlite');
        expect(snap.name).toBe('child');
        expect(snap.columns.map((c) => [c.key, c.name])).toEqual([
            ['id', 'id'],
            ['parentId', 'parent_id'],
            ['ownerId', 'owner_id'],
            ['selfId', 'self_id'],
            ['label', 'label'],
            ['count', 'count'],
            ['ratio', 'ratio'],
            ['active', 'active'],
            ['createdAt', 'created_at'],
            ['status', 'status'],
            ['note', 'note'],
        ]);
    });

    it('normalizes boolean defaults to 1/0 and carries enum values', () => {
        const snap = toSnapshotTable(child, 'sqlite');
        expect(snap.columns.find((c) => c.key === 'active')?.default).toBe(1);
        expect(snap.columns.find((c) => c.key === 'status')?.enumValues).toEqual([
            'a',
            'b',
            "c'd",
        ]);
    });

    it('resolves every reference column to a foreign key', () => {
        const snap = toSnapshotTable(child, 'sqlite');
        expect(snap.fks).toEqual([
            {
                column: 'parent_id',
                targetTable: 'parent',
                targetColumn: 'id',
                onDelete: 'cascade',
            },
            {
                column: 'owner_id',
                targetTable: 'users',
                targetColumn: 'id',
                onDelete: 'no action',
            },
            {
                column: 'self_id',
                targetTable: 'child',
                targetColumn: 'id',
                onDelete: 'no action',
            },
        ]);
    });

    it('omits primaryKey entirely for a table with a single-column key', () => {
        expect(toSnapshotTable(parent, 'sqlite')).not.toHaveProperty('primaryKey');
    });

    it('snake_cases a composite primary key and keeps the options-form indexes', () => {
        const snap = toSnapshotTable(edge, 'sqlite');
        expect(snap.primaryKey).toEqual(['source_id', 'target_kind']);
        expect(snap.indexes).toEqual([
            { name: 'idx_edge_label', columns: ['label'], unique: false },
        ]);
    });

    it('lists explicit indexes first, then the synthesized column-unique ones', () => {
        const snap = toSnapshotTable(child, 'sqlite');
        expect(snap.indexes).toEqual([
            { name: 'idx_child_parent', columns: ['parent_id'], unique: false },
            {
                name: 'child_parent_label_unique',
                columns: ['parent_id', 'label'],
                unique: true,
                where: 'label IS NOT NULL',
            },
            { name: 'child_label_unique', columns: ['label'], unique: true },
        ]);
    });
});

describe('emit wrappers', () => {
    it('emitCreateTable renders columns then table-level FKs', () => {
        expect(emitCreateTable(parent, 'sqlite')).toBe(
            [
                'CREATE TABLE `parent` (',
                '    `id` text PRIMARY KEY NOT NULL,',
                '    `name` text NOT NULL',
                ')',
            ].join('\n')
        );
    });

    it('emitCreateIndexes renders explicit indexes then synthesized column-unique indexes', () => {
        expect(emitCreateIndexes(child, 'sqlite')).toEqual([
            'CREATE INDEX `idx_child_parent` ON `child` (`parent_id`)',
            'CREATE UNIQUE INDEX `child_parent_label_unique` ON `child` (`parent_id`,`label`) WHERE label IS NOT NULL',
            'CREATE UNIQUE INDEX `child_label_unique` ON `child` (`label`)',
        ]);
    });

    it('emitCreateIndexes is empty for a table with no indexes and no column-level uniques', () => {
        expect(emitCreateIndexes(parent, 'sqlite')).toEqual([]);
    });

    it('emitTableStatements emits CREATE TABLE first, then the index statements', () => {
        const statements = emitTableStatements(child, 'sqlite');
        expect(statements[0]).toBe(emitCreateTable(child, 'sqlite'));
        expect(statements.slice(1)).toEqual(emitCreateIndexes(child, 'sqlite'));
    });
});

describe('createSnapshot', () => {
    it('has the expected top-level shape, tables keyed + sorted by name', () => {
        const snapshot = createSnapshot([entriesTable, rolesTable], {
            dialect: 'sqlite',
        });
        expect(snapshot.version).toBe(1);
        expect(snapshot.dialect).toBe('sqlite');
        expect(Object.keys(snapshot.tables)).toEqual(['entries', 'roles']);
    });

    it('includes the synthesized column-unique index', () => {
        const snapshot = createSnapshot([entryPreviewTokensTable], { dialect: 'sqlite' });
        expect(snapshot.tables.entry_preview_tokens?.indexes).toContainEqual({
            name: 'entry_preview_tokens_token_unique',
            columns: ['token'],
            unique: true,
        });
    });

    it('resolves foreign keys to their target table + column', () => {
        const snapshot = createSnapshot([entriesTable], { dialect: 'sqlite' });
        expect(snapshot.tables.entries?.fks).toContainEqual({
            column: 'staged_for',
            targetTable: 'entries',
            targetColumn: 'id',
            onDelete: 'no action',
        });
        expect(snapshot.tables.entries?.fks).toContainEqual({
            column: 'created_by',
            targetTable: 'users',
            targetColumn: 'id',
            onDelete: 'no action',
        });
    });

    it('carries enum values on enum columns', () => {
        const snapshot = createSnapshot([relationshipsTable], { dialect: 'sqlite' });
        const sourceKind = snapshot.tables.relationships?.columns.find(
            (c) => c.key === 'sourceKind'
        );
        expect(sourceKind?.enumValues).toEqual(['entry', 'user', 'media']);
    });

    it('excludes app-side-only facts (appDefault, onUpdate, serialize, parse) from columns', () => {
        const snapshot = createSnapshot([rolesTable], { dialect: 'sqlite' });
        const createdAt = snapshot.tables.roles?.columns.find(
            (c) => c.key === 'createdAt'
        );
        expect(createdAt).toBeDefined();
        expect(Object.keys(createdAt ?? {}).sort()).toEqual(
            ['key', 'name', 'kind', 'notNull', 'primaryKey', 'type'].sort()
        );
    });
});

describe('serializeSnapshot', () => {
    it('is deterministic — identical output for identical input regardless of table order', () => {
        const a = serializeSnapshot(
            createSnapshot([rolesTable, entriesTable, cronTable], { dialect: 'sqlite' })
        );
        const b = serializeSnapshot(
            createSnapshot([cronTable, entriesTable, rolesTable], { dialect: 'sqlite' })
        );
        expect(a).toBe(b);
    });
});
