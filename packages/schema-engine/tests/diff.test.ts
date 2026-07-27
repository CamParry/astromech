/**
 * Unit tests for the snapshot differ (`src/diff.ts`).
 *
 * Fixtures are small snapshot literals, so assertions stay independent of any
 * particular caller's schema definition format. Covers every rule: fast-path vs
 * rebuild column changes, index diffing on non-rebuilt tables, and every
 * validation error/warning.
 */

import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/diff.js';
import { col, fk, index, snap, table } from './_support/tables.js';

describe('diffSnapshots', () => {
    it('prev === null → createTable for every table, no warnings', () => {
        const widgets = table('widgets', [col.id()]);
        const result = diffSnapshots(null, snap(widgets));
        expect(result.ops).toEqual([{ kind: 'createTable', table: widgets }]);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('identical snapshots → no ops, no errors, no warnings', () => {
        const widgets = table('widgets', [col.id(), col.text('name', { notNull: true })]);
        const result = diffSnapshots(snap(widgets), snap(widgets));
        expect(result).toEqual({ ops: [], errors: [], warnings: [] });
    });

    it('a table only in next → createTable', () => {
        const existing = table('widgets', [col.id()]);
        const added = table('gadgets', [col.id()]);
        const result = diffSnapshots(snap(existing), snap(existing, added));
        expect(result.ops).toEqual([{ kind: 'createTable', table: added }]);
        expect(result.warnings).toEqual([]);
    });

    it('a table only in prev → dropTable + warning', () => {
        const existing = table('widgets', [col.id()]);
        const removed = table('gadgets', [col.id()]);
        const result = diffSnapshots(snap(existing, removed), snap(existing));
        expect(result.ops).toEqual([{ kind: 'dropTable', name: 'gadgets' }]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/gadgets/);
        expect(result.errors).toEqual([]);
    });

    it('a new nullable column → addColumn (fast-path)', () => {
        const note = col.text('note');
        const prev = table('widgets', [col.id()]);
        const next = table('widgets', [col.id(), note]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toEqual([
            { kind: 'addColumn', table: 'widgets', column: note },
        ]);
        expect(result.errors).toEqual([]);
    });

    it('a new NOT NULL column with a literal default → addColumn (fast-path)', () => {
        const prev = table('widgets', [col.id()]);
        const next = table('widgets', [
            col.id(),
            col.integer('count', { notNull: true, default: 0 }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('addColumn');
        expect(result.errors).toEqual([]);
    });

    it('a new NOT NULL column with no default → error', () => {
        const prev = table('widgets', [col.id()]);
        const next = table('widgets', [
            col.id(),
            col.integer('count', { notNull: true }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/count/);
        expect(result.errors[0]).toMatch(/NOT NULL/);
    });

    it('a changed column storage type → rebuildTable + warning', () => {
        const prev = table('widgets', [col.id(), col.text('count')]);
        const next = table('widgets', [col.id(), col.integer('count')]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /storage type changed/.test(w))).toBe(true);
    });

    it('nullable → NOT NULL with a default → rebuildTable with coalesceDefault', () => {
        const prev = table('widgets', [col.id(), col.integer('count')]);
        const next = table('widgets', [
            col.id(),
            col.integer('count', { notNull: true, default: 7 }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
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
        const prev = table('widgets', [col.id(), col.integer('count')]);
        const next = table('widgets', [
            col.id(),
            col.integer('count', { notNull: true }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/count/);
    });

    it('an enum value removed → rebuildTable + warning (narrowed)', () => {
        const prev = table('widgets', [
            col.id(),
            col.enum('status', ['a', 'b', 'c'], { notNull: true }),
        ]);
        const next = table('widgets', [
            col.id(),
            col.enum('status', ['a', 'b'], { notNull: true }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /narrowed/.test(w))).toBe(true);
    });

    it('an enum value only added (not narrowed) → rebuildTable, no narrowed warning', () => {
        const prev = table('widgets', [
            col.id(),
            col.enum('status', ['a', 'b'], { notNull: true }),
        ]);
        const next = table('widgets', [
            col.id(),
            col.enum('status', ['a', 'b', 'c'], { notNull: true }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
        expect(result.warnings.some((w) => /narrowed/.test(w))).toBe(false);
    });

    it('a new unique index on an existing table → createIndex + warning', () => {
        const columns = [col.id(), col.text('slug', { notNull: true })];
        const prev = table('widgets', columns);
        const next = table('widgets', columns, {
            indexes: [index('widgets_slug_unique', ['slug'], { unique: true })],
        });
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]).toEqual({
            kind: 'createIndex',
            table: 'widgets',
            index: { name: 'widgets_slug_unique', columns: ['slug'], unique: true },
        });
        expect(result.warnings.some((w) => /unique index/.test(w))).toBe(true);
    });

    it('a non-unique index whose column set changes → dropIndex + createIndex', () => {
        const columns = [col.id(), col.text('a'), col.text('b')];
        const prev = table('widgets', columns, {
            indexes: [index('idx_widgets_a', ['a'])],
        });
        const next = table('widgets', columns, {
            indexes: [index('idx_widgets_a', ['a', 'b'])],
        });
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops.map((op) => op.kind)).toEqual(['dropIndex', 'createIndex']);
        expect(result.warnings).toEqual([]);
    });

    it('an FK onDelete change → rebuildTable', () => {
        const parents = table('parents', [col.id()]);
        const columns = [col.id(), col.reference('parent_id')];
        const prev = table('widgets', columns, {
            fks: [fk('parent_id', 'parents', 'no action')],
        });
        const next = table('widgets', columns, {
            fks: [fk('parent_id', 'parents', 'cascade')],
        });
        const result = diffSnapshots(snap(parents, prev), snap(parents, next));
        const widgetsOp = result.ops.find(
            (op) => 'table' in op && (op.table as { name?: string }).name === 'widgets'
        );
        expect(widgetsOp?.kind).toBe('rebuildTable');
    });

    it('a primary-key membership change → rebuildTable', () => {
        const prev = table('widgets', [col.id(), col.text('code')]);
        const next = table('widgets', [
            col.id(),
            col.text('code', { primaryKey: true, notNull: true }),
        ]);
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]?.kind).toBe('rebuildTable');
    });

    it('an index naming an unknown column → error', () => {
        const widgets = table('widgets', [col.id()], {
            indexes: [index('idx_widgets_bogus', ['bogus'])],
        });
        const result = diffSnapshots(null, snap(widgets));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/bogus/);
    });

    it('duplicate index names across two tables → error', () => {
        const a = table('widgets', [col.id()], {
            indexes: [index('dup_name', ['id'])],
        });
        const b = table('gadgets', [col.id()], {
            indexes: [index('dup_name', ['id'])],
        });
        const result = diffSnapshots(null, snap(a, b));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/dup_name/);
    });

    it('a table name over the 63-byte identifier limit → error', () => {
        const long = `widgets_${'x'.repeat(60)}`;
        const result = diffSnapshots(null, snap(table(long, [col.id()])));
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/63-byte/);
    });

    it('a table name at exactly 63 bytes is fine — table names are never capped', () => {
        const exact = `w${'x'.repeat(62)}`;
        const result = diffSnapshots(null, snap(table(exact, [col.id()])));
        expect(result.errors).toEqual([]);
    });

    it('a rebuilt table emits no separate index ops', () => {
        const prev = table('widgets', [col.id(), col.text('a')], {
            indexes: [index('idx_widgets_a', ['a'])],
        });
        const next = table('widgets', [col.id(), col.integer('a')], {
            indexes: [index('idx_widgets_a', ['a'])],
        });
        const result = diffSnapshots(snap(prev), snap(next));
        expect(result.ops.map((op) => op.kind)).toEqual(['rebuildTable']);
    });

    it('op ordering: dropIndex, dropTable, createTable, addColumn, rebuildTable, createIndex', () => {
        const dropped = table('dropped', [col.id()]);

        const addColTable = table('add_col_table', [col.id()]);
        const addColTableNext = table('add_col_table', [col.id(), col.text('note')]);

        const rebuildTable = table('rebuild_table', [col.id(), col.text('count')]);
        const rebuildTableNext = table('rebuild_table', [col.id(), col.integer('count')]);

        const indexColumns = [col.id(), col.text('a'), col.text('b')];
        const indexTable = table('index_table', indexColumns, {
            indexes: [index('idx_index_table_a', ['a'])],
        });
        const indexTableNext = table('index_table', indexColumns, {
            indexes: [index('idx_index_table_a', ['a', 'b'])],
        });

        const added = table('added', [col.id()]);

        const prevSnap = snap(dropped, addColTable, rebuildTable, indexTable);
        const nextSnap = snap(addColTableNext, rebuildTableNext, indexTableNext, added);
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
