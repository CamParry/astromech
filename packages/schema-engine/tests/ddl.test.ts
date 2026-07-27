/**
 * Unit tests for the DDL renderers (`src/ddl.ts`).
 *
 * Exercises literal quoting/escaping, per-flag column clause rendering, the
 * enum CHECK, `CREATE TABLE` column-then-FK ordering, index rendering
 * (columns/unique/where), and `renderTableStatements` ordering — against small
 * snapshot literals.
 */

import { describe, expect, it } from 'vitest';
import {
    foreignKeyName,
    renderColumnClause,
    renderCreateIndex,
    renderCreateTable,
    renderLiteral,
    renderTableStatements,
} from '../src/ddl.js';
import { col, fk, index, table } from './_support/tables.js';

const child = table(
    'child',
    [
        col.id(),
        col.reference('parent_id', { notNull: true }),
        col.reference('owner_id'),
        col.reference('self_id'),
        col.text('label'),
        col.integer('count', { default: 0 }),
        col.real('ratio', { default: 1.5 }),
        col.integer('active', { notNull: true, default: 1 }),
        col.text('created_at', { notNull: true }),
        col.enum('status', ['a', 'b', "c'd"], { notNull: true, default: 'a' }),
        col.text('note', { default: "it's" }),
    ],
    {
        fks: [
            fk('parent_id', 'parent', 'cascade'),
            fk('owner_id', 'users'),
            fk('self_id', 'child'),
        ],
        indexes: [
            index('idx_child_parent', ['parent_id']),
            index('child_parent_label_unique', ['parent_id', 'label'], {
                unique: true,
                where: 'label IS NOT NULL',
            }),
            index('child_label_unique', ['label'], { unique: true }),
        ],
    }
);

const parent = table('parent', [col.id(), col.text('name', { notNull: true })]);

describe('renderLiteral', () => {
    it('quotes strings, doubling embedded single quotes', () => {
        expect(renderLiteral('plain')).toBe("'plain'");
        expect(renderLiteral("it's")).toBe("'it''s'");
    });

    it('renders booleans as 1/0 and numbers verbatim', () => {
        expect(renderLiteral(true)).toBe('1');
        expect(renderLiteral(false)).toBe('0');
        expect(renderLiteral(0)).toBe('0');
        expect(renderLiteral(1.5)).toBe('1.5');
    });
});

describe('renderColumnClause', () => {
    it('renders PRIMARY KEY / DEFAULT / NOT NULL in that order', () => {
        expect(renderColumnClause(col.id())).toBe('`id` text PRIMARY KEY NOT NULL');
        expect(
            renderColumnClause(col.integer('count', { notNull: true, default: 0 }))
        ).toBe('`count` integer DEFAULT 0 NOT NULL');
        expect(renderColumnClause(col.text('note'))).toBe('`note` text');
    });

    it('appends a CHECK clause for a column carrying enum values', () => {
        expect(renderColumnClause(col.enum('status', ['a', "b'c"]))).toBe(
            "`status` text CHECK (`status` IN ('a', 'b''c'))"
        );
    });
});

describe('renderCreateTable', () => {
    it('renders columns then table-level FKs, quoting/escaping defaults and enum CHECKs', () => {
        expect(renderCreateTable(child)).toBe(
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
                '    CONSTRAINT `child_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `parent`(`id`) ON UPDATE no action ON DELETE cascade,',
                '    CONSTRAINT `child_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,',
                '    CONSTRAINT `child_self_id_fkey` FOREIGN KEY (`self_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE no action',
                ')',
            ].join('\n')
        );
    });

    it('names FK constraints after `constraintsFor` when given — the rebuild path', () => {
        const rendered = renderCreateTable({ ...child, name: '__new_child' }, 'child');

        expect(rendered).toContain('CREATE TABLE `__new_child` (');
        expect(rendered).toContain('CONSTRAINT `child_parent_id_fkey`');
        expect(rendered).not.toContain('__new_child_parent_id_fkey');
    });

    it('caps an over-long FK constraint name', () => {
        const longName = `t_${'x'.repeat(70)}`;
        const rendered = renderCreateTable({ ...child, name: longName });
        const constraint = /CONSTRAINT `([^`]+)`/.exec(rendered)?.[1];

        expect(constraint).toBe(foreignKeyName(longName, 'parent_id'));
        expect(constraint).toHaveLength(63);
    });

    it('omits the FK block entirely when a table has no foreign keys', () => {
        expect(renderCreateTable(parent)).toBe(
            [
                'CREATE TABLE `parent` (',
                '    `id` text PRIMARY KEY NOT NULL,',
                '    `name` text NOT NULL',
                ')',
            ].join('\n')
        );
    });
});

describe('renderCreateIndex', () => {
    it('renders plain, unique, and partial indexes', () => {
        expect(renderCreateIndex('child', index('idx_child_parent', ['parent_id']))).toBe(
            'CREATE INDEX `idx_child_parent` ON `child` (`parent_id`)'
        );
        expect(
            renderCreateIndex(
                'child',
                index('child_parent_label_unique', ['parent_id', 'label'], {
                    unique: true,
                    where: 'label IS NOT NULL',
                })
            )
        ).toBe(
            'CREATE UNIQUE INDEX `child_parent_label_unique` ON `child` (`parent_id`,`label`) WHERE label IS NOT NULL'
        );
    });
});

describe('renderTableStatements', () => {
    it('emits CREATE TABLE first, then every index statement in order', () => {
        const statements = renderTableStatements(child);
        expect(statements[0]).toBe(renderCreateTable(child));
        expect(statements.slice(1)).toEqual([
            'CREATE INDEX `idx_child_parent` ON `child` (`parent_id`)',
            'CREATE UNIQUE INDEX `child_parent_label_unique` ON `child` (`parent_id`,`label`) WHERE label IS NOT NULL',
            'CREATE UNIQUE INDEX `child_label_unique` ON `child` (`label`)',
        ]);
    });

    it('is just the CREATE TABLE for a table with no indexes', () => {
        expect(renderTableStatements(parent)).toEqual([renderCreateTable(parent)]);
    });
});
