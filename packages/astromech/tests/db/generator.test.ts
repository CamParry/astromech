/**
 * Tests for the migration generator (`database/generator.ts`) — the Node fs
 * orchestration wiring `snapshot.ts` → `diff.ts` → `migration-render.ts`
 * against a real `migrations/` directory on disk.
 *
 * Each test gets its own `mkdtemp` scratch directory. The end-to-end apply
 * test additionally runs the generated migrations against a real libsql db
 * (plain DDL/DML, so `:memory:` is fine — no storage transaction is involved,
 * so the `:memory:`-poisons-after-tx harness gotcha doesn't apply here).
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { Kysely, sql } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { defineTable, type TableDescriptor } from '@/database/define-table.js';
import { generateMigrations } from '@/database/generator.js';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'astromech-gen-'));
    try {
        await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const v1: TableDescriptor[] = [
    defineTable('widgets', ({ col }) => ({
        id: col.id(),
        name: col.text({ notNull: true }),
    })),
];

const v2WithColumn: TableDescriptor[] = [
    defineTable('widgets', ({ col }) => ({
        id: col.id(),
        name: col.text({ notNull: true }),
        note: col.text(),
    })),
];

describe('generateMigrations', () => {
    it('first run against an empty dir generates 0000', async () => {
        await withTempDir(async (dir) => {
            const result = await generateMigrations({
                dir,
                tables: v1,
                dialect: 'sqlite',
                name: 'init',
            });
            expect(result.status).toBe('generated');
            if (result.status !== 'generated') return;
            expect(result.tag).toBe('0000_init');

            const files = await readdir(dir);
            expect(files.sort()).toEqual([
                '0000_init.ts',
                'index.ts',
                'journal.json',
                'snapshot.json',
            ]);

            const journal = JSON.parse(
                await readFile(resolve(dir, 'journal.json'), 'utf-8')
            );
            expect(journal.entries).toEqual([
                { idx: 0, tag: '0000_init', when: expect.any(Number) },
            ]);

            const indexSource = await readFile(resolve(dir, 'index.ts'), 'utf-8');
            expect(indexSource).toContain("import * as m0000 from './0000_init.js';");
            expect(indexSource).toContain("'0000_init': m0000,");
        });
    });

    it('rerunning against the same descriptors → no-changes, writes nothing new', async () => {
        await withTempDir(async (dir) => {
            await generateMigrations({
                dir,
                tables: v1,
                dialect: 'sqlite',
                name: 'init',
            });
            const filesBefore = (await readdir(dir)).sort();

            const result = await generateMigrations({
                dir,
                tables: v1,
                dialect: 'sqlite',
                name: 'init-again',
            });
            expect(result).toEqual({ status: 'no-changes' });

            const filesAfter = (await readdir(dir)).sort();
            expect(filesAfter).toEqual(filesBefore);
        });
    });

    it('a descriptor change generates 0001, journal grows to 2 entries, index.ts lists both', async () => {
        await withTempDir(async (dir) => {
            await generateMigrations({
                dir,
                tables: v1,
                dialect: 'sqlite',
                name: 'init',
            });
            const result = await generateMigrations({
                dir,
                tables: v2WithColumn,
                dialect: 'sqlite',
                name: 'add note',
            });
            expect(result.status).toBe('generated');
            if (result.status !== 'generated') return;
            expect(result.tag).toBe('0001_add-note');

            const journal = JSON.parse(
                await readFile(resolve(dir, 'journal.json'), 'utf-8')
            );
            expect(journal.entries).toHaveLength(2);
            expect(journal.entries.map((e: { tag: string }) => e.tag)).toEqual([
                '0000_init',
                '0001_add-note',
            ]);

            const indexSource = await readFile(resolve(dir, 'index.ts'), 'utf-8');
            expect(indexSource).toContain("import * as m0000 from './0000_init.js';");
            expect(indexSource).toContain("import * as m0001 from './0001_add-note.js';");
            expect(indexSource).toContain("'0000_init': m0000,");
            expect(indexSource).toContain("'0001_add-note': m0001,");
        });
    });

    it('an invalid descriptor set throws and writes nothing', async () => {
        await withTempDir(async (dir) => {
            const invalid: TableDescriptor[] = [
                defineTable(
                    'widgets',
                    ({ col }) => ({ id: col.id() }),
                    ({ index }) => [index('idx_widgets_bogus', ['bogus'])]
                ),
            ];
            await expect(
                generateMigrations({
                    dir,
                    tables: invalid,
                    dialect: 'sqlite',
                    name: 'init',
                })
            ).rejects.toThrow(/\[Astromech\]/);

            const files = await readdir(dir).catch(() => []);
            expect(files).toEqual([]);
        });
    });

    it('applies a generated rebuild migration to a seeded db, preserving data and COALESCE-backfilling the new NOT NULL column', async () => {
        await withTempDir(async (dir) => {
            const nullable: TableDescriptor[] = [
                defineTable('widgets', ({ col }) => ({
                    id: col.id(),
                    name: col.text({ notNull: true }),
                    count: col.integer(),
                })),
            ];
            const first = await generateMigrations({
                dir,
                tables: nullable,
                dialect: 'sqlite',
                name: 'init',
            });
            expect(first.status).toBe('generated');
            if (first.status !== 'generated') return;

            const client = createClient({ url: ':memory:' });
            const db = new Kysely<unknown>({
                dialect: new LibsqlDialect({ client: client as never }),
            });

            const initMod = (await import(
                pathToFileURL(resolve(dir, `${first.tag}.ts`)).href
            )) as { up: (db: Kysely<unknown>) => Promise<void> };
            await initMod.up(db);

            await sql`INSERT INTO \`widgets\` (\`id\`, \`name\`, \`count\`) VALUES ('w1', 'kept-row', NULL)`.execute(
                db
            );

            const notNullWithDefault: TableDescriptor[] = [
                defineTable('widgets', ({ col }) => ({
                    id: col.id(),
                    name: col.text({ notNull: true }),
                    count: col.integer({ notNull: true, default: 42 }),
                })),
            ];
            const second = await generateMigrations({
                dir,
                tables: notNullWithDefault,
                dialect: 'sqlite',
                name: 'require-count',
            });
            expect(second.status).toBe('generated');
            if (second.status !== 'generated') return;

            const rebuildMod = (await import(
                pathToFileURL(resolve(dir, `${second.tag}.ts`)).href
            )) as { up: (db: Kysely<unknown>) => Promise<void> };
            await rebuildMod.up(db);

            const { rows } = await sql<{ id: string; name: string; count: number }>`
                SELECT id, name, count FROM widgets WHERE id = 'w1'
            `.execute(db);
            expect(rows).toEqual([{ id: 'w1', name: 'kept-row', count: 42 }]);
        });
    });
});
