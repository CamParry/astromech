/**
 * Unit tests for the migration statement/file renderer
 * (`database/migration-render.ts`).
 *
 * Exercises the exact rebuild statement sequence (PRAGMA → CREATE __new_ →
 * INSERT…SELECT with COALESCE → DROP → RENAME → indexes), the empty-copy
 * skip, `addColumn`'s CHECK rendering for enum columns, and
 * `renderMigrationFile`'s backtick-escaping + overall shape.
 */

import { describe, expect, it } from 'vitest';
import { renderMigrationFile, renderOpStatements } from '@/database/migration-render.js';
import type { TableOp } from '@/database/diff.js';
import type { SnapshotTable } from '@/database/snapshot.js';

const widgets: SnapshotTable = {
    name: 'widgets',
    columns: [
        {
            key: 'id',
            name: 'id',
            kind: 'id',
            type: 'text',
            notNull: true,
            primaryKey: true,
        },
        {
            key: 'count',
            name: 'count',
            kind: 'integer',
            type: 'integer',
            notNull: true,
            primaryKey: false,
            default: 0,
        },
    ],
    fks: [],
    indexes: [{ name: 'idx_widgets_count', columns: ['count'], unique: false }],
};

describe('renderOpStatements', () => {
    it('rebuildTable renders the exact sequence: PRAGMA → CREATE __new_ → INSERT…SELECT (COALESCE) → DROP → RENAME → indexes', () => {
        const op: TableOp = {
            kind: 'rebuildTable',
            table: widgets,
            copy: [{ column: 'id' }, { column: 'count', coalesceDefault: 0 }],
        };
        const statements = renderOpStatements(op, 'sqlite');
        expect(statements).toHaveLength(6);
        expect(statements[0]).toBe('PRAGMA defer_foreign_keys = true');
        expect(statements[1]).toMatch(/^CREATE TABLE `__new_widgets` \(/);
        expect(statements[2]).toBe(
            'INSERT INTO `__new_widgets` (`id`, `count`) SELECT `id`, COALESCE(`count`, 0) FROM `widgets`'
        );
        expect(statements[3]).toBe('DROP TABLE `widgets`');
        expect(statements[4]).toBe('ALTER TABLE `__new_widgets` RENAME TO `widgets`');
    });

    it('rebuildTable with indexes appends CREATE INDEX statements after the rename', () => {
        const op: TableOp = {
            kind: 'rebuildTable',
            table: widgets,
            copy: [{ column: 'id' }, { column: 'count' }],
        };
        const statements = renderOpStatements(op, 'sqlite');
        expect(statements.at(-1)).toBe(
            'CREATE INDEX `idx_widgets_count` ON `widgets` (`count`)'
        );
    });

    it('rebuildTable with an empty copy list skips the INSERT statement entirely', () => {
        const op: TableOp = { kind: 'rebuildTable', table: widgets, copy: [] };
        const statements = renderOpStatements(op, 'sqlite');
        expect(statements.some((s) => s.startsWith('INSERT'))).toBe(false);
        expect(statements[0]).toBe('PRAGMA defer_foreign_keys = true');
        expect(statements[1]).toMatch(/^CREATE TABLE `__new_widgets`/);
        expect(statements[2]).toBe('DROP TABLE `widgets`');
    });

    it('addColumn renders a CHECK clause for an enum column', () => {
        const op: TableOp = {
            kind: 'addColumn',
            table: 'widgets',
            column: {
                key: 'status',
                name: 'status',
                kind: 'enum',
                type: 'text',
                notNull: true,
                primaryKey: false,
                default: 'a',
                enumValues: ['a', 'b'],
            },
        };
        expect(renderOpStatements(op, 'sqlite')).toEqual([
            "ALTER TABLE `widgets` ADD COLUMN `status` text DEFAULT 'a' NOT NULL CHECK (`status` IN ('a', 'b'))",
        ]);
    });

    it('createTable renders the CREATE TABLE then its indexes', () => {
        const op: TableOp = { kind: 'createTable', table: widgets };
        const statements = renderOpStatements(op, 'sqlite');
        expect(statements[0]).toMatch(/^CREATE TABLE `widgets`/);
        expect(statements[1]).toBe(
            'CREATE INDEX `idx_widgets_count` ON `widgets` (`count`)'
        );
    });

    it('dropTable / dropIndex / createIndex render single statements', () => {
        expect(
            renderOpStatements({ kind: 'dropTable', name: 'widgets' }, 'sqlite')
        ).toEqual(['DROP TABLE `widgets`']);
        expect(
            renderOpStatements(
                { kind: 'dropIndex', table: 'widgets', name: 'idx_x' },
                'sqlite'
            )
        ).toEqual(['DROP INDEX `idx_x`']);
        expect(
            renderOpStatements(
                {
                    kind: 'createIndex',
                    table: 'widgets',
                    index: { name: 'idx_x', columns: ['count'], unique: false },
                },
                'sqlite'
            )
        ).toEqual(['CREATE INDEX `idx_x` ON `widgets` (`count`)']);
    });
});

describe('renderMigrationFile', () => {
    it('escapes backticks and produces a syntactically-plausible TS module', () => {
        const ops: TableOp[] = [{ kind: 'createTable', table: widgets }];
        const source = renderMigrationFile(ops, 'sqlite');

        expect(source).toContain("import { sql, type Kysely } from 'kysely';");
        expect(source).toContain(
            'export async function up(db: Kysely<unknown>): Promise<void> {'
        );
        expect(source).not.toContain('down(');
        // Every identifier backtick inside the embedded SQL is escaped so it
        // doesn't terminate the enclosing `sql`...`` template literal.
        expect(source).toContain('\\`widgets\\`');
        expect(source).not.toMatch(/[^\\]`widgets`/);
    });

    it('renders a multi-line CREATE TABLE indented inside the sql`` template, and a single-line statement inline', () => {
        const ops: TableOp[] = [
            { kind: 'createTable', table: widgets },
            { kind: 'dropTable', name: 'gadgets' },
        ];
        const source = renderMigrationFile(ops, 'sqlite');
        expect(source).toContain('    await sql`\n        CREATE TABLE');
        expect(source).toContain('    await sql`DROP TABLE \\`gadgets\\``.execute(db);');
    });

    it('renders "// no-op" body for an empty op list', () => {
        const source = renderMigrationFile([], 'sqlite');
        expect(source).toContain('// no-op');
    });
});
