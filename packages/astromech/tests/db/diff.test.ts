/**
 * Unit tests for the snapshot differ (`database/diff.ts`).
 *
 * Fixtures are small local `defineTable` descriptors turned into snapshots
 * via `createSnapshot`, so assertions stay independent of the production
 * schema. Covers every rule from `specs/data-layer.md` §"Step 4": fast-path
 * vs rebuild column changes, index diffing on non-rebuilt tables, and every
 * validation error/warning.
 */

import { describe, expect, it } from 'vitest';
import { defineTable } from '@/database/define-table.js';
import { createSnapshot, type Snapshot } from '@/database/snapshot.js';
import { diffSnapshots } from '@/database/diff.js';

function snap(tables: Parameters<typeof createSnapshot>[0]): Snapshot {
    return createSnapshot(tables, { dialect: 'sqlite' });
}

describe('diffSnapshots', () => {
    it('prev === null → createTable for every table, no warnings', () => {
        const t = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const result = diffSnapshots(null, snap([t]));
        expect(result.ops).toEqual([
            { kind: 'createTable', table: snap([t]).tables.widgets },
        ]);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('identical snapshots → no ops, no errors, no warnings', () => {
        const t = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            name: col.text({ notNull: true }),
        }));
        const a = snap([t]);
        const b = snap([t]);
        const result = diffSnapshots(a, b);
        expect(result).toEqual({ ops: [], errors: [], warnings: [] });
    });

    it('a table only in next → createTable', () => {
        const existing = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const added = defineTable('gadgets', ({ col }) => ({ id: col.id() }));
        const result = diffSnapshots(snap([existing]), snap([existing, added]));
        expect(result.ops).toEqual([
            { kind: 'createTable', table: snap([added]).tables.gadgets },
        ]);
        expect(result.warnings).toEqual([]);
    });

    it('a table only in prev → dropTable + warning', () => {
        const existing = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const removed = defineTable('gadgets', ({ col }) => ({ id: col.id() }));
        const result = diffSnapshots(snap([existing, removed]), snap([existing]));
        expect(result.ops).toEqual([{ kind: 'dropTable', name: 'gadgets' }]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/gadgets/);
        expect(result.errors).toEqual([]);
    });

    it('a new nullable column → addColumn (fast-path)', () => {
        const prev = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            note: col.text(),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toEqual([
            {
                kind: 'addColumn',
                table: 'widgets',
                column: snap([next]).tables.widgets?.columns[1],
            },
        ]);
        expect(result.errors).toEqual([]);
    });

    it('a new NOT NULL column with a literal default → addColumn (fast-path)', () => {
        const prev = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer({ notNull: true, default: 0 }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('addColumn');
        expect(result.errors).toEqual([]);
    });

    it('a new NOT NULL column with no default → error', () => {
        const prev = defineTable('widgets', ({ col }) => ({ id: col.id() }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer({ notNull: true }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/count/);
        expect(result.errors[0]).toMatch(/NOT NULL/);
    });

    it('a changed column storage type → rebuildTable + warning', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.text(),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer(),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /storage type changed/.test(w))).toBe(true);
    });

    it('nullable → NOT NULL with a default → rebuildTable with coalesceDefault', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer(),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer({ notNull: true, default: 7 }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        const op = result.ops[0];
        if (op?.kind !== 'rebuildTable') throw new Error('expected a rebuildTable op');
        expect(op.copy).toEqual([
            { column: 'id' },
            { column: 'count', coalesceDefault: 7 },
        ]);
        expect(result.errors).toEqual([]);
    });

    it('nullable → NOT NULL with no default → error', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer(),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            count: col.integer({ notNull: true }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/count/);
    });

    it('an enum value removed → rebuildTable + warning (narrowed)', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            status: col.enum(['a', 'b', 'c'], { notNull: true }),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            status: col.enum(['a', 'b'], { notNull: true }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /narrowed/.test(w))).toBe(true);
    });

    it('an enum value only added (not narrowed) → rebuildTable, no narrowed warning', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            status: col.enum(['a', 'b'], { notNull: true }),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            status: col.enum(['a', 'b', 'c'], { notNull: true }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /narrowed/.test(w))).toBe(false);
    });

    it('a new unique index on an existing table → createIndex + warning', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            slug: col.text({ notNull: true }),
        }));
        const next = defineTable(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                slug: col.text({ notNull: true }),
            }),
            ({ index }) => [index('widgets_slug_unique', ['slug'], { unique: true })]
        );
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]).toEqual({
            kind: 'createIndex',
            table: 'widgets',
            index: { name: 'widgets_slug_unique', columns: ['slug'], unique: true },
        });
        expect(result.warnings.some((w) => /unique index/.test(w))).toBe(true);
    });

    it('a non-unique index whose column set changes → dropIndex + createIndex', () => {
        const prev = defineTable(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                a: col.text(),
                b: col.text(),
            }),
            ({ index }) => [index('idx_widgets_a', ['a'])]
        );
        const next = defineTable(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                a: col.text(),
                b: col.text(),
            }),
            ({ index }) => [index('idx_widgets_a', ['a', 'b'])]
        );
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops.map((op) => op.kind)).toEqual(['dropIndex', 'createIndex']);
        expect(result.warnings).toEqual([]);
    });

    it('an FK onDelete change → rebuildTable', () => {
        const parent = defineTable('parents', ({ col }) => ({ id: col.id() }));
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            parentId: col.reference(() => parent, { onDelete: 'no action' }),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            parentId: col.reference(() => parent, { onDelete: 'cascade' }),
        }));
        const result = diffSnapshots(snap([parent, prev]), snap([parent, next]));
        const widgetsOp = result.ops.find(
            (op) => 'table' in op && (op.table as { name?: string }).name === 'widgets'
        );
        expect(widgetsOp?.kind).toBe('rebuildTable');
    });

    it('a primary-key membership change → rebuildTable', () => {
        const prev = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            code: col.text(),
        }));
        const next = defineTable('widgets', ({ col }) => ({
            id: col.id(),
            code: col.text({ primaryKey: true }),
        }));
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
    });

    it('an index naming an unknown column → error', () => {
        const t = defineTable(
            'widgets',
            ({ col }) => ({ id: col.id() }),
            ({ index }) => [index('idx_widgets_bogus', ['bogus'])]
        );
        const result = diffSnapshots(null, snap([t]));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/bogus/);
    });

    it('duplicate index names across two tables → error', () => {
        const a = defineTable(
            'widgets',
            ({ col }) => ({ id: col.id() }),
            ({ index }) => [index('dup_name', ['id'])]
        );
        const b = defineTable(
            'gadgets',
            ({ col }) => ({ id: col.id() }),
            ({ index }) => [index('dup_name', ['id'])]
        );
        const result = diffSnapshots(null, snap([a, b]));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/dup_name/);
    });

    it('a rebuilt table emits no separate index ops', () => {
        const prev = defineTable(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                a: col.text(),
            }),
            ({ index }) => [index('idx_widgets_a', ['a'])]
        );
        const next = defineTable(
            'widgets',
            ({ col }) => ({
                id: col.id(),
                a: col.integer(), // type change forces a rebuild
            }),
            ({ index }) => [index('idx_widgets_a', ['a'])]
        );
        const result = diffSnapshots(snap([prev]), snap([next]));
        expect(result.ops.map((op) => op.kind)).toEqual(['rebuildTable']);
    });

    it('op ordering: dropIndex, dropTable, createTable, addColumn, rebuildTable, createIndex', () => {
        const dropped = defineTable('dropped', ({ col }) => ({ id: col.id() }));

        const addColTable = defineTable('add_col_table', ({ col }) => ({
            id: col.id(),
        }));
        const addColTableNext = defineTable('add_col_table', ({ col }) => ({
            id: col.id(),
            note: col.text(),
        }));

        const rebuildTable = defineTable('rebuild_table', ({ col }) => ({
            id: col.id(),
            count: col.text(),
        }));
        const rebuildTableNext = defineTable('rebuild_table', ({ col }) => ({
            id: col.id(),
            count: col.integer(),
        }));

        const indexTable = defineTable(
            'index_table',
            ({ col }) => ({ id: col.id(), a: col.text(), b: col.text() }),
            ({ index }) => [index('idx_index_table_a', ['a'])]
        );
        const indexTableNext = defineTable(
            'index_table',
            ({ col }) => ({ id: col.id(), a: col.text(), b: col.text() }),
            ({ index }) => [index('idx_index_table_a', ['a', 'b'])]
        );

        const added = defineTable('added', ({ col }) => ({ id: col.id() }));

        const prevSnap = snap([dropped, addColTable, rebuildTable, indexTable]);
        const nextSnap = snap([addColTableNext, rebuildTableNext, indexTableNext, added]);
        const result = diffSnapshots(prevSnap, nextSnap);

        expect(result.ops.map((op) => op.kind)).toEqual([
            'dropIndex',
            'dropTable',
            'createTable',
            'addColumn',
            'rebuildTable',
            'createIndex',
        ]);
    });
});
