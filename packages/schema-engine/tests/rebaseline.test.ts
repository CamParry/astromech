/**
 * Tests for `rebaselineMigrations` (`src/generate.ts`) — re-emitting a
 * baseline migration from the current snapshot.
 *
 * Each test gets its own `mkdtemp` scratch directory holding a hand-written
 * baseline: one banner block for a table the snapshot describes, one for a
 * "foreign" table it does not (the better-auth case), so preservation is
 * observable. The apply test runs the rewritten chain against a real libsql db.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { Kysely, sql } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { rebaselineMigrations } from '../src/generate';
import { renderMigrationFile } from '../src/render';
import { serializeSnapshot } from '../src/model';
import { col, index, snap, table } from './_support/tables';

const FOREIGN_BLOCK = [
    '    // ── legacy_users ───────────────────────────────────────────────────────',
    '    // Hand-authored: better-auth owns this table.',
    '    await sql`',
    '        CREATE TABLE \\`legacy_users\\` (',
    '            \\`id\\` text PRIMARY KEY NOT NULL,',
    '            \\`created_at\\` integer NOT NULL',
    '        )',
    '    `.execute(db);',
].join('\n');

const OLD_WIDGETS_BLOCK = [
    '    // ── widgets ────────────────────────────────────────────────────────────',
    '    await sql`',
    '        CREATE TABLE \\`widgets\\` (',
    '            \\`id\\` text PRIMARY KEY NOT NULL',
    '        )',
    '    `.execute(db);',
].join('\n');

const widgets = snap(
    table('widgets', [col.id(), col.text('name', { notNull: true })], {
        indexes: [index('idx_widgets_name', ['name'])],
    })
);

const withGadgets = snap(
    table('widgets', [col.id(), col.text('name', { notNull: true })]),
    table('gadgets', [col.id()])
);

type JournalEntry = { idx: number; tag: string; when: number };

/** Write a migrations directory holding a baseline and `extra` later entries. */
async function seedDir(
    dir: string,
    opts: { body?: string; later?: string[] } = {}
): Promise<void> {
    const body = opts.body ?? [OLD_WIDGETS_BLOCK, FOREIGN_BLOCK].join('\n\n');
    await writeFile(
        resolve(dir, '0000_baseline.ts'),
        [
            '/** Hand-authored baseline. */',
            "import { sql, type Kysely } from 'kysely';",
            '',
            'export async function up(db: Kysely<unknown>): Promise<void> {',
            body,
            '}',
            '',
        ].join('\n'),
        'utf-8'
    );

    const entries: JournalEntry[] = [{ idx: 0, tag: '0000_baseline', when: 1 }];
    for (const [i, tag] of (opts.later ?? []).entries()) {
        entries.push({ idx: i + 1, tag, when: i + 2 });
        await writeFile(resolve(dir, `${tag}.ts`), '// later migration\n', 'utf-8');
    }
    await writeFile(
        resolve(dir, 'journal.json'),
        `${JSON.stringify({ version: 1, dialect: 'sqlite', entries }, null, 2)}\n`,
        'utf-8'
    );
    await writeFile(resolve(dir, 'snapshot.json'), '{}\n', 'utf-8');
}

/** A later migration module whose `up()` runs one statement. */
function laterMigration(statement: string): string {
    return [
        "import { sql, type Kysely } from 'kysely';",
        '',
        'export async function up(db: Kysely<unknown>): Promise<void> {',
        `    await sql\`${statement}\`.execute(db);`,
        '}',
        '',
    ].join('\n');
}

/** Every file in `dir`, name → contents, for asserting nothing was written. */
async function readAll(dir: string): Promise<Record<string, string>> {
    const files = await readdir(dir);
    const entries = await Promise.all(
        files.map(
            async (file): Promise<[string, string]> => [
                file,
                await readFile(resolve(dir, file), 'utf-8'),
            ]
        )
    );
    return Object.fromEntries(entries);
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'schema-engine-rebaseline-'));
    try {
        await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

describe('rebaselineMigrations', () => {
    it('re-emits the described table, copies the foreign block verbatim, appends new tables', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir);

            const result = await rebaselineMigrations({
                dir,
                snapshot: withGadgets,
                dialect: 'sqlite',
            });

            expect(result.tag).toBe('0000_baseline');
            expect(result.emitted).toEqual(['widgets', 'gadgets']);
            expect(result.preserved).toEqual(['legacy_users']);
            expect(result.deleted).toEqual([]);

            const source = await readFile(resolve(dir, '0000_baseline.ts'), 'utf-8');
            expect(source).toContain(FOREIGN_BLOCK);
            expect(source).toContain('\\`name\\` text NOT NULL');
            expect(source).toContain('db:rebaseline');
            // File order: the old file's order first, then the new table.
            expect(source.indexOf('── widgets ')).toBeLessThan(
                source.indexOf('── legacy_users ')
            );
            expect(source.indexOf('── legacy_users ')).toBeLessThan(
                source.indexOf('── gadgets ')
            );
        });
    });

    it('rewrites snapshot.json to the given snapshot and regenerates index.ts', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir);

            await rebaselineMigrations({ dir, snapshot: widgets, dialect: 'sqlite' });

            expect(await readFile(resolve(dir, 'snapshot.json'), 'utf-8')).toBe(
                `${serializeSnapshot(widgets)}\n`
            );
            const indexSource = await readFile(resolve(dir, 'index.ts'), 'utf-8');
            expect(indexSource).toContain("import * as m0000 from './0000_baseline';");
            expect(indexSource).toContain("'0000_baseline': m0000,");
        });
    });

    it('refuses a longer chain without --collapse, and writes nothing', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir, { later: ['0001_add-note'] });
            const before = await readFile(resolve(dir, '0000_baseline.ts'), 'utf-8');

            await expect(
                rebaselineMigrations({ dir, snapshot: widgets, dialect: 'sqlite' })
            ).rejects.toThrow(/--collapse/);

            expect(await readFile(resolve(dir, '0000_baseline.ts'), 'utf-8')).toBe(
                before
            );
            expect(await readFile(resolve(dir, 'snapshot.json'), 'utf-8')).toBe('{}\n');
        });
    });

    it('--collapse folds the chain: later migrations and ops are deleted, the journal keeps one entry', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir, { later: ['0001_add-note', '0002_drop-note'] });
            await mkdir(resolve(dir, 'ops'), { recursive: true });
            await writeFile(
                resolve(dir, 'ops', '0002-drop-note.ts'),
                'export default () => [];\n',
                'utf-8'
            );

            const result = await rebaselineMigrations({
                dir,
                snapshot: widgets,
                dialect: 'sqlite',
                collapse: true,
            });

            expect(result.deleted.sort()).toEqual([
                '0001_add-note.ts',
                '0002_drop-note.ts',
                'ops/0002-drop-note.ts',
            ]);
            expect((await readdir(dir)).sort()).toEqual([
                '0000_baseline.ts',
                'index.ts',
                'journal.json',
                'snapshot.json',
            ]);

            const journal = JSON.parse(
                await readFile(resolve(dir, 'journal.json'), 'utf-8')
            ) as { entries: JournalEntry[] };
            expect(journal.entries).toEqual([{ idx: 0, tag: '0000_baseline', when: 1 }]);

            const indexSource = await readFile(resolve(dir, 'index.ts'), 'utf-8');
            expect(indexSource).not.toContain('0001_add-note');
        });
    });

    // The rebuild path writes `INSERT INTO __new_widgets … FROM widgets` and
    // drops/renames around it. That is emitter output for a table the fresh
    // baseline creates whole, so collapsing past it loses nothing. Rendered by
    // the real renderer rather than written out here, so the two stay in step.
    it('--collapse folds a chain containing a table rebuild', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir, { later: ['0001_rebuild-widgets'] });
            const [widgetsTable] = Object.values(widgets.tables);
            if (!widgetsTable) throw new Error('fixture has no widgets table');
            await writeFile(
                resolve(dir, '0001_rebuild-widgets.ts'),
                renderMigrationFile(
                    [
                        {
                            kind: 'rebuildTable',
                            table: widgetsTable,
                            copy: [{ column: 'id' }, { column: 'name' }],
                        },
                    ],
                    'sqlite'
                ),
                'utf-8'
            );

            const result = await rebaselineMigrations({
                dir,
                snapshot: widgets,
                dialect: 'sqlite',
                collapse: true,
            });

            expect(result.deleted).toEqual(['0001_rebuild-widgets.ts']);
            expect(await readFile(resolve(dir, '0000_baseline.ts'), 'utf-8')).toContain(
                '── widgets '
            );
        });
    });

    it('refuses a baseline whose blocks it cannot see', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir, { body: '    await sql`SELECT 1`.execute(db);' });

            await expect(
                rebaselineMigrations({ dir, snapshot: widgets, dialect: 'sqlite' })
            ).rejects.toThrow(/before the first/);
        });
    });

    describe('refusals — each writes nothing', () => {
        /** Snapshot every file in `dir`, run `fn`, assert nothing moved. */
        async function expectUnchanged(
            dir: string,
            fn: () => Promise<void>
        ): Promise<void> {
            const before = await readAll(dir);
            await fn();
            expect(await readAll(dir)).toEqual(before);
        }

        it('refuses to collapse a later migration that ALTERs a table no descriptor describes', async () => {
            await withTempDir(async (dir) => {
                await seedDir(dir, { later: ['0001_touch-legacy'] });
                await writeFile(
                    resolve(dir, '0001_touch-legacy.ts'),
                    laterMigration(
                        'ALTER TABLE \\`legacy_users\\` ADD COLUMN \\`note\\` text'
                    ),
                    'utf-8'
                );

                await expectUnchanged(dir, async () => {
                    await expect(
                        rebaselineMigrations({
                            dir,
                            snapshot: widgets,
                            dialect: 'sqlite',
                            collapse: true,
                        })
                    ).rejects.toThrow(
                        /ALTER TABLE names "legacy_users", a table no descriptor describes/
                    );
                });
            });
        });

        it('refuses to collapse a later migration that writes data', async () => {
            await withTempDir(async (dir) => {
                await seedDir(dir, { later: ['0001_seed-widgets'] });
                await writeFile(
                    resolve(dir, '0001_seed-widgets.ts'),
                    laterMigration(
                        "INSERT INTO \\`widgets\\` (\\`id\\`, \\`name\\`) VALUES ('1', 'a')"
                    ),
                    'utf-8'
                );

                await expectUnchanged(dir, async () => {
                    await expect(
                        rebaselineMigrations({
                            dir,
                            snapshot: widgets,
                            dialect: 'sqlite',
                            collapse: true,
                        })
                    ).rejects.toThrow(/INSERT on "widgets" is a data statement/);
                });
            });
        });

        it('refuses a statement that trails the last banner', async () => {
            await withTempDir(async (dir) => {
                await seedDir(dir, {
                    body: [
                        OLD_WIDGETS_BLOCK,
                        '',
                        '    await sql`CREATE TABLE \\`orphan\\` (\\`id\\` text)`.execute(db);',
                    ].join('\n'),
                });

                await expectUnchanged(dir, async () => {
                    await expect(
                        rebaselineMigrations({
                            dir,
                            snapshot: widgets,
                            dialect: 'sqlite',
                        })
                    ).rejects.toThrow(/the "widgets" block holds "CREATE TABLE `orphan`/);
                });
            });
        });

        it('refuses a non-CREATE statement inside a block the emitter replaces', async () => {
            await withTempDir(async (dir) => {
                await seedDir(dir, {
                    body: [
                        OLD_WIDGETS_BLOCK,
                        "    await sql`INSERT INTO \\`widgets\\` (\\`id\\`) VALUES ('1')`.execute(db);",
                    ].join('\n'),
                });

                await expectUnchanged(dir, async () => {
                    await expect(
                        rebaselineMigrations({
                            dir,
                            snapshot: widgets,
                            dialect: 'sqlite',
                        })
                    ).rejects.toThrow(/the "widgets" block holds "INSERT INTO `widgets`/);
                });
            });
        });

        it('refuses a baseline with a down()', async () => {
            await withTempDir(async (dir) => {
                await seedDir(dir);
                const source = await readFile(resolve(dir, '0000_baseline.ts'), 'utf-8');
                await writeFile(
                    resolve(dir, '0000_baseline.ts'),
                    `${source}\nexport async function down(db: Kysely<unknown>): Promise<void> {\n    await sql\`DROP TABLE \\\`widgets\\\`\`.execute(db);\n}\n`,
                    'utf-8'
                );

                await expectUnchanged(dir, async () => {
                    await expect(
                        rebaselineMigrations({
                            dir,
                            snapshot: widgets,
                            dialect: 'sqlite',
                        })
                    ).rejects.toThrow(
                        /"export async function down\(.*follows the `up\(\)` body/
                    );
                });
            });
        });
    });

    it('the rewritten baseline applies to a fresh database', async () => {
        await withTempDir(async (dir) => {
            await seedDir(dir);
            await rebaselineMigrations({ dir, snapshot: withGadgets, dialect: 'sqlite' });

            const client = createClient({ url: ':memory:' });
            const db = new Kysely<unknown>({
                dialect: new LibsqlDialect({ client: client as never }),
            });
            const mod = (await import(
                pathToFileURL(resolve(dir, '0000_baseline.ts')).href
            )) as { up: (db: Kysely<unknown>) => Promise<void> };
            await mod.up(db);

            const { rows } = await sql<{ name: string }>`
                SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
            `.execute(db);
            expect(rows.map((r) => r.name)).toEqual([
                'gadgets',
                'legacy_users',
                'widgets',
            ]);
        });
    });
});
