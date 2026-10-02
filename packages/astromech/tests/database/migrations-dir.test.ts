/**
 * A config naming its own `migrationsDir`: the generator writes the chain there,
 * `runMigrations` applies it from there and `checkMigrationDrift` compares the
 * database against it, each resolving the folder against the working directory.
 */

import type { DB } from '@/database/types';
import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { expectConsole } from '@tests/console';
import { makeTestConfig } from '@tests/harness';
import { openTestDb } from '@tests/test-db';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { resolveMigrationsDir } from '@/database/app-migrations';
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

        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
        await checkMigrationDrift(db, [], migrationsDir);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('1 migration has not been applied');

        const messages: string[] = [];
        const logger = {
            info: (message: string) => messages.push(message),
            error: (message: string) => messages.push(message),
        };
        await runMigrations(db, logger, [], migrationsDir);
        expect(messages).toEqual(['Astromech database migrations applied']);
        const { rows } = await sql<{ name: string }>`
            SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'
        `.execute(db);
        expect(rows).toHaveLength(1);

        warn.mockClear();
        await checkMigrationDrift(db, [], migrationsDir);
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('checkMigrationDrift', () => {
    it('logs a migrations index that fails to load, and skips the check', async () => {
        await mkdir(join(siteDir, 'broken'));
        await writeFile(
            join(siteDir, 'broken', 'index.ts'),
            'export const migrationProvider = {;\n'
        );
        expectConsole(
            'error',
            '[Astromech] could not load the migrations, so the database was not checked for pending ones'
        );

        await expect(checkMigrationDrift(db, [], './broken')).resolves.toBeUndefined();
    });

    // A bundled runtime ships no migrations folder, and a new site may not have
    // run `db:generate` yet.
    it('skips the check without logging when the migrations folder does not exist', async () => {
        await expect(
            checkMigrationDrift(db, [], './no-migrations-here')
        ).resolves.toBeUndefined();
    });
});
