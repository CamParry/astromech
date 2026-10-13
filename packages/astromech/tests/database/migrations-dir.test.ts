/**
 * A config naming its own `migrationsDir`: the generator writes the chain there,
 * the provider imported from it passes the journal check, and `runMigrations`
 * applies it and `checkMigrationDrift` compares the database against it.
 */

import type { DB } from '@/database/types';
import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { access, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { makeTestConfig } from '@tests/harness';
import { openTestDb } from '@tests/test-db';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import {
    checkedMigrationProvider,
    resolveMigrationsDir,
} from '@/database/app-migrations';
import { generateMigrations } from '@/database/generate';
import { checkMigrationDrift, runMigrations } from '@/database/migrations';
import { CORE_TABLES } from '@/database/tables';
import { log } from '@/utilities/log';

let siteDir: string;
let client: Client;
let db: Kysely<DB>;

beforeAll(async () => {
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-migrations-dir-'));
    // The generated files import `kysely`, which a real site has installed.
    await symlink(
        fileURLToPath(new URL('../../node_modules', import.meta.url)),
        join(siteDir, 'node_modules'),
        'dir'
    );

    client = createClient({ url: `file:${join(siteDir, 'database.db')}` });
    db = openTestDb(client);
});

// Per test, since `restoreMocks` undoes every spy before each test runs.
beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(siteDir);
});

afterAll(async () => {
    // Before the next file's hooks, which `restoreMocks` does not reach.
    vi.restoreAllMocks();
    await db.destroy();
    client.close();
    await rm(siteDir, { recursive: true, force: true });
});

describe('a config naming its own migrationsDir', () => {
    it('generates, applies and checks the chain in that folder', async () => {
        const { migrationsDir } = resolveConfig({
            ...makeTestConfig(),
            migrationsDir: './database/chain',
        });

        const generated = await generateMigrations({
            dir: resolveMigrationsDir(migrationsDir),
            tables: CORE_TABLES,
            dialect: 'sqlite',
            name: 'migration',
        });
        expect(generated.status).toBe('generated');
        await expect(
            access(join(siteDir, 'database', 'chain', 'index.ts'))
        ).resolves.toBeUndefined();
        await expect(access(join(siteDir, 'migrations'))).rejects.toThrow();

        // What the site's config imports.
        const { migrationProvider } = (await import(
            join(siteDir, 'database', 'chain', 'index.ts')
        )) as { migrationProvider: MigrationProvider };
        const provider = await checkedMigrationProvider(
            { migrations: migrationProvider, plugins: [] },
            migrationsDir
        );
        if (provider === null) throw new Error('the generated chain is empty');

        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
        await checkMigrationDrift(db, provider);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('1 migration has not been applied');

        const messages: string[] = [];
        await runMigrations(db, { info: (message) => messages.push(message) }, provider);
        expect(messages).toEqual(['Astromech database migrations applied']);
        const { rows } = await sql<{ name: string }>`
            SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'
        `.execute(db);
        expect(rows).toHaveLength(1);

        warn.mockClear();
        await checkMigrationDrift(db, provider);
        expect(warn).not.toHaveBeenCalled();
    });
});
