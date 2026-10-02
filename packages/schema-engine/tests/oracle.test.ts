/**
 * Tests for the schema oracle (`src/oracle.ts`).
 *
 * Covers whitespace normalization, the canonical column order, the optional
 * table filter (including quote escaping in the generated `IN (…)` list), and
 * exclusion of SQLite's internal and implicit rows.
 */

import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { dumpSchema } from '../src/oracle';

async function makeDb(statements: string[]): Promise<Kysely<unknown>> {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    for (const statement of statements) {
        await sql.raw(statement).execute(db);
    }
    return db;
}

describe('dumpSchema', () => {
    it('normalizes whitespace and orders by (type, tblName, name)', async () => {
        const db = await makeDb([
            'CREATE TABLE `widgets` (\n    `id` text PRIMARY KEY NOT NULL,\n    `name` text\n)',
            'CREATE TABLE `gadgets` (`id` text PRIMARY KEY NOT NULL)',
            'CREATE INDEX `idx_widgets_name` ON `widgets` (`name`)',
        ]);

        const rows = await dumpSchema(db);
        expect(rows.map((r) => [r.type, r.tblName, r.name])).toEqual([
            ['index', 'widgets', 'idx_widgets_name'],
            ['table', 'gadgets', 'gadgets'],
            ['table', 'widgets', 'widgets'],
        ]);

        const widgets = rows.find((r) => r.name === 'widgets');
        expect(widgets?.sql).toBe(
            'CREATE TABLE `widgets` (`id` text PRIMARY KEY NOT NULL, `name` text)'
        );
    });

    it('lists columns by name, then table constraints in their own order', async () => {
        const db = await makeDb([
            'CREATE TABLE `parents` (`id` text PRIMARY KEY NOT NULL)',
            'CREATE TABLE `widgets` (\n    `zeta` text,\n    `id` text NOT NULL,\n' +
                '    `parent` text,\n    PRIMARY KEY (`id`, `zeta`),\n' +
                '    CONSTRAINT `widgets_parent_fkey` FOREIGN KEY (`parent`) REFERENCES `parents`(`id`)\n' +
                ') WITHOUT ROWID',
        ]);

        const [, widgets] = await dumpSchema(db);
        expect(widgets?.sql).toBe(
            'CREATE TABLE `widgets` (`id` text NOT NULL, `parent` text, `zeta` text, ' +
                'PRIMARY KEY (`id`, `zeta`), ' +
                'CONSTRAINT `widgets_parent_fkey` FOREIGN KEY (`parent`) REFERENCES `parents`(`id`)' +
                ') WITHOUT ROWID'
        );
    });

    it('keeps a comma or parenthesis inside a literal or quoted name in its column', async () => {
        const db = await makeDb([
            "CREATE TABLE `widgets` (`b` text DEFAULT ',)', \"a,(\" text, [c] text, d text CHECK (d IN ('x', 'y')))",
        ]);

        const [row] = await dumpSchema(db);
        expect(row?.sql).toBe(
            'CREATE TABLE `widgets` ("a,(" text, `b` text DEFAULT \',)\', ' +
                "[c] text, d text CHECK (d IN ('x', 'y')))"
        );
    });

    // `ALTER TABLE ADD COLUMN` appends the column before the closing `)` with
    // its own spacing, or before the first table constraint.
    const fk = 'CONSTRAINT `t_p_fkey` FOREIGN KEY (`p`) REFERENCES `t`(`id`)';
    it.each([
        { shape: 'no table constraint', fresh: ['`id`', '`p`', '`c1`'], constraints: [] },
        { shape: 'a foreign key', fresh: ['`id`', '`p`', '`c1`'], constraints: [fk] },
        { shape: 'the column mid-list', fresh: ['`id`', '`c1`', '`p`'], constraints: [] },
    ])(
        'dumps a table with an added column like a fresh build with $shape',
        async ({ fresh, constraints }) => {
            const create = (columns: string[]): string =>
                'CREATE TABLE `t` (\n    ' +
                [...columns.map((c) => `${c} text`), ...constraints].join(',\n    ') +
                '\n)';
            const migrated = await makeDb([
                create(['`id`', '`p`']),
                'ALTER TABLE `t` ADD COLUMN `c1` text',
            ]);

            expect(await dumpSchema(migrated)).toEqual(
                await dumpSchema(await makeDb([create(fresh)]))
            );
        }
    );

    it('filters to the requested tables', async () => {
        const db = await makeDb([
            'CREATE TABLE `widgets` (`id` text PRIMARY KEY NOT NULL, `name` text)',
            'CREATE TABLE `gadgets` (`id` text PRIMARY KEY NOT NULL)',
            'CREATE INDEX `idx_widgets_name` ON `widgets` (`name`)',
        ]);

        const rows = await dumpSchema(db, { tables: ['widgets'] });
        expect(rows.map((r) => r.name)).toEqual(['idx_widgets_name', 'widgets']);
    });

    it('escapes single quotes in filter table names rather than breaking the query', async () => {
        const db = await makeDb([
            'CREATE TABLE `widgets` (`id` text PRIMARY KEY NOT NULL)',
        ]);

        await expect(dumpSchema(db, { tables: ["it's", 'widgets'] })).resolves.toEqual([
            expect.objectContaining({ type: 'table', name: 'widgets' }),
        ]);
    });

    it('normalizes the double-quoted name a RENAME leaves behind', async () => {
        const db = await makeDb([
            'CREATE TABLE `__new_widgets` (`id` text PRIMARY KEY NOT NULL)',
            'ALTER TABLE `__new_widgets` RENAME TO `widgets`',
        ]);

        const [row] = await dumpSchema(db);
        expect(row?.sql).toBe('CREATE TABLE `widgets` (`id` text PRIMARY KEY NOT NULL)');
    });

    it('leaves a double quote inside a string literal alone', async () => {
        const db = await makeDb(["CREATE TABLE `widgets` (`kind` text DEFAULT 'a\"b')"]);

        const [row] = await dumpSchema(db);
        expect(row?.sql).toContain("'a\"b'");
    });

    it('excludes internal sqlite_* rows and implicit (NULL-sql) indexes', async () => {
        const db = await makeDb([
            // AUTOINCREMENT creates the internal `sqlite_sequence` table; the
            // UNIQUE constraint creates an implicit `sqlite_autoindex_*` with a
            // NULL `sql`.
            'CREATE TABLE `widgets` (`id` integer PRIMARY KEY AUTOINCREMENT, `slug` text UNIQUE)',
        ]);

        const rows = await dumpSchema(db);
        expect(rows.map((r) => r.name)).toEqual(['widgets']);
    });
});
