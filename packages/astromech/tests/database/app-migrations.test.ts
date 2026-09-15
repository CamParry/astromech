/**
 * Unit tests for `database/app-migrations.ts`.
 *
 * The generated `migrations/index.ts` imports its siblings by `.js` specifier,
 * which plain Node cannot resolve — the loader has to transpile.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppMigrations, resolveMigrationsDir } from '@/database/app-migrations';

const created: string[] = [];

/** A throwaway app directory holding `migrations/` with the given files; returns that folder. */
async function migrationsFolder(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'astromech-migrations-'));
    created.push(dir);
    const folder = join(dir, 'migrations');
    await mkdir(folder, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
        await writeFile(join(folder, name), contents, 'utf-8');
    }
    return folder;
}

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
        created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
});

describe('resolveMigrationsDir', () => {
    it('resolves a relative folder against the working directory', () => {
        vi.spyOn(process, 'cwd').mockReturnValue('/site');

        expect(resolveMigrationsDir('./database/migrations')).toBe(
            '/site/database/migrations'
        );
        expect(resolveMigrationsDir('./migrations')).toBe('/site/migrations');
    });

    it('keeps an absolute folder as written', () => {
        vi.spyOn(process, 'cwd').mockReturnValue('/site');

        expect(resolveMigrationsDir('/srv/migrations')).toBe('/srv/migrations');
    });
});

const MIGRATION = `
export async function up() {}
export async function down() {}
`;

describe('loadAppMigrations', () => {
    it('resolves a TypeScript migration chain written with .js specifiers', async () => {
        const dir = await migrationsFolder({
            '0000_baseline.ts': MIGRATION,
            'index.ts': `
                import * as m0000 from './0000_baseline';
                export const migrationProvider = {
                    async getMigrations() {
                        return { '0000_baseline': m0000 };
                    },
                };
            `,
        });

        const provider = await loadAppMigrations(dir);

        expect(Object.keys(await provider.getMigrations())).toEqual(['0000_baseline']);
    });

    it('names the file when the module has no migrationProvider export', async () => {
        const dir = await migrationsFolder({ 'index.ts': 'export const other = 1;' });

        await expect(loadAppMigrations(dir)).rejects.toThrow(/migrationProvider/);
    });
});
