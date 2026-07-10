/**
 * Unit tests for the DDL emitter (`database/ddl.ts`).
 *
 * Exercises per-kind column rendering, DEFAULT quoting/escaping, enum CHECK,
 * FK resolution (descriptor target, string target, self-ref thunk, onDelete),
 * synthesized column-unique indexes, explicit indexes (columns/unique/where),
 * and full `emitTableStatements` ordering — against small local fixtures
 * rather than the 9 real tables, so the assertions stay independent of the
 * production schema.
 */

import { describe, expect, it } from 'vitest';
import { defineTable, type TableDescriptor } from '@/database/define-table.js';
import {
    columnType,
    emitCreateIndexes,
    emitCreateTable,
    emitTableStatements,
    resolveReferenceTarget,
    toSnakeCase,
} from '@/database/ddl.js';

describe('toSnakeCase', () => {
    it('converts camelCase keys to snake_case identifiers', () => {
        expect(toSnakeCase('localeGroup')).toBe('locale_group');
        expect(toSnakeCase('id')).toBe('id');
        expect(toSnakeCase('isBuiltIn')).toBe('is_built_in');
    });
});

describe('columnType', () => {
    it('maps every column kind to its sqlite storage type', () => {
        expect(columnType('id', 'sqlite')).toBe('text');
        expect(columnType('text', 'sqlite')).toBe('text');
        expect(columnType('integer', 'sqlite')).toBe('integer');
        expect(columnType('real', 'sqlite')).toBe('real');
        expect(columnType('boolean', 'sqlite')).toBe('integer');
        expect(columnType('timestamp', 'sqlite')).toBe('text');
        expect(columnType('json', 'sqlite')).toBe('text');
        expect(columnType('enum', 'sqlite')).toBe('text');
        expect(columnType('reference', 'sqlite')).toBe('text');
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
        selfId: col.reference((): TableDescriptor => child, { onDelete: 'no action' }),
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

describe('resolveReferenceTarget', () => {
    it('resolves a string target to {table, column: "id"}', () => {
        expect(resolveReferenceTarget('users')).toEqual({ table: 'users', column: 'id' });
    });

    it('resolves a descriptor target to its name + primary-key column', () => {
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

    it('throws for a descriptor target with no primary key', () => {
        expect(() => resolveReferenceTarget(orphan)).toThrow();
    });
});

describe('emitCreateTable', () => {
    it('renders columns then table-level FKs, quoting/escaping defaults and enum CHECKs', () => {
        const statement = emitCreateTable(child, 'sqlite');
        expect(statement).toBe(
            [
                'CREATE TABLE `child` (',
                '    `id` text PRIMARY KEY NOT NULL,',
                '    `parent_id` text NOT NULL,',
                '    `owner_id` text,',
                '    `self_id` text,',
                '    `label` text,',
                '    `count` integer DEFAULT 0,',
                '    `ratio` real DEFAULT 1.5,',
                '    `active` integer DEFAULT 1 NOT NULL,',
                '    `created_at` text NOT NULL,',
                "    `status` text DEFAULT 'a' NOT NULL CHECK (`status` IN ('a', 'b', 'c''d')),",
                "    `note` text DEFAULT 'it''s',",
                '    FOREIGN KEY (`parent_id`) REFERENCES `parent`(`id`) ON UPDATE no action ON DELETE cascade,',
                '    FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,',
                '    FOREIGN KEY (`self_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE no action',
                ')',
            ].join('\n')
        );
    });

    it('omits the FK block entirely when a table has no reference columns', () => {
        const statement = emitCreateTable(parent, 'sqlite');
        expect(statement).toBe(
            [
                'CREATE TABLE `parent` (',
                '    `id` text PRIMARY KEY NOT NULL,',
                '    `name` text NOT NULL',
                ')',
            ].join('\n')
        );
    });
});

describe('emitCreateIndexes', () => {
    it('renders explicit indexes then synthesized column-unique indexes', () => {
        expect(emitCreateIndexes(child, 'sqlite')).toEqual([
            'CREATE INDEX `idx_child_parent` ON `child` (`parent_id`)',
            'CREATE UNIQUE INDEX `child_parent_label_unique` ON `child` (`parent_id`,`label`) WHERE label IS NOT NULL',
            'CREATE UNIQUE INDEX `child_label_unique` ON `child` (`label`)',
        ]);
    });

    it('is empty for a table with no indexes and no column-level uniques', () => {
        expect(emitCreateIndexes(parent, 'sqlite')).toEqual([]);
    });
});

describe('emitTableStatements', () => {
    it('emits CREATE TABLE first, then the index statements', () => {
        const statements = emitTableStatements(child, 'sqlite');
        expect(statements[0]).toBe(emitCreateTable(child, 'sqlite'));
        expect(statements.slice(1)).toEqual(emitCreateIndexes(child, 'sqlite'));
        expect(statements).toHaveLength(1 + emitCreateIndexes(child, 'sqlite').length);
    });
});
