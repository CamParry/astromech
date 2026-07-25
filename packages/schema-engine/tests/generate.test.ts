/**
 * Tests for the migration generator (`src/generate.ts`) — the Node fs
 * orchestration wiring `diff.ts` → `render.ts` against a real `migrations/`
 * directory on disk.
 *
 * Each test gets its own `mkdtemp` scratch directory. The end-to-end apply test
 * additionally runs the generated migrations against a real libsql db (plain
 * DDL/DML, so `:memory:` is fine).
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { Kysely, sql } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { generateMigrations } from '../src/generate.js';
import { col, index, snap, table } from './_support/tables.js';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'schema-engine-gen-'));
    try {
        await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const v1 = snap(table('widgets', [col.id(), col.text('name', { notNull: true })]));

const v2WithColumn = snap(
    table('widgets', [col.id(), col.text('name', { notNull: true }), col.text('note')])
);

describe('generateMigrations', () => {
    it('first run against an empty dir generates 0000', async () => {
        await withTempDir(async (dir) => {
            const result = await generateMigrations({
                dir,
                snapshot: v1,
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
            ) as { entries: { idx: number; tag: string; when: number }[] };
            expect(journal.entries).toEqual([
                { idx: 0, tag: '0000_init', when: expect.any(Number) },
            ]);

            const indexSource = await readFile(resolve(dir, 'index.ts'), 'utf-8');
            expect(indexSource).toContain("import * as m0000 from './0000_init.js';");
            expect(indexSource).toContain("'0000_init': m0000,");
        });
    });

    it('rerunning against the same snapshot → no-changes, writes nothing new', async () => {
        await withTempDir(async (dir) => {
            await generateMigrations({
                dir,
                snapshot: v1,
                dialect: 'sqlite',
                name: 'init',
            });
            const filesBefore = (await readdir(dir)).sort();

            const result = await generateMigrations({
                dir,
                snapshot: v1,
                dialect: 'sqlite',
                name: 'init-again',
            });
            expect(result).toEqual({ status: 'no-changes' });

            const filesAfter = (await readdir(dir)).sort();
            expect(filesAfter).toEqual(filesBefore);
        });
    });

    it('a snapshot change generates 0001, journal grows to 2 entries, index.ts lists both', async () => {
        await withTempDir(async (dir) => {
            await generateMigrations({
                dir,
                snapshot: v1,
                dialect: 'sqlite',
                name: 'init',
            });
            const result = await generateMigrations({
                dir,
                snapshot: v2WithColumn,
                dialect: 'sqlite',
                name: 'add note',
            });
            expect(result.status).toBe('generated');
            if (result.status !== 'generated') return;
            expect(result.tag).toBe('0001_add-note');

            const journal = JSON.parse(
                await readFile(resolve(dir, 'journal.json'), 'utf-8')
            ) as { entries: { tag: string }[] };
            expect(journal.entries).toHaveLength(2);
            expect(journal.entries.map((e) => e.tag)).toEqual([
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

    it('an invalid snapshot throws and writes nothing', async () => {
        await withTempDir(async (dir) => {
            const invalid = snap(
                table('widgets', [col.id()], {
                    indexes: [index('idx_widgets_bogus', ['bogus'])],
                })
            );
            await expect(
                generateMigrations({
                    dir,
                    snapshot: invalid,
                    dialect: 'sqlite',
                    name: 'init',
                })
            ).rejects.toThrow(/migration generation failed/);

            const files = await readdir(dir).catch(() => []);
            expect(files).toEqual([]);
        });
    });

    it('applies a generated rebuild migration to a seeded db, preserving data and COALESCE-backfilling the new NOT NULL column', async () => {
        await withTempDir(async (dir) => {
            const nullable = snap(
                table('widgets', [
                    col.id(),
                    col.text('name', { notNull: true }),
                    col.integer('count'),
                ])
            );
            const first = await generateMigrations({
                dir,
                snapshot: nullable,
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

            const notNullWithDefault = snap(
                table('widgets', [
                    col.id(),
                    col.text('name', { notNull: true }),
                    col.integer('count', { notNull: true, default: 42 }),
                ])
            );
            const second = await generateMigrations({
                dir,
                snapshot: notNullWithDefault,
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
