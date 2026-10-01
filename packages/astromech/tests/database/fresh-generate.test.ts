/**
 * A new site's first `db:generate` and `db:init`: generate from `CORE_TABLES`
 * into an empty directory, apply the chain through the loader `db:init` uses,
 * and run first-run setup and a sign-in against the result. The demo's chain
 * cannot stand in for this, because it was not generated from an empty directory.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateToLatest } from '@astromech/schema-engine';
import { expectConsole } from '@tests/console';
import { makeTestConfig, resetRuntime, setupTestConfig } from '@tests/harness';
import { getMigrations } from 'better-auth/db/migration';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAuth } from '@/auth/better-auth';
import { createFirstAdmin } from '@/auth/setup';
import { loadAppMigrations } from '@/database/app-migrations';
import { libsql } from '@/database/drivers/libsql';
import { generateMigrations } from '@/database/generate';
import { CORE_TABLES } from '@/database/tables';

let siteDir: string;
let db: Kysely<DB>;

beforeAll(async () => {
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-fresh-site-'));
    // The generated files import `kysely`, which a real site has installed.
    await symlink(
        fileURLToPath(new URL('../../node_modules', import.meta.url)),
        join(siteDir, 'node_modules'),
        'dir'
    );

    const generated = await generateMigrations({
        dir: join(siteDir, 'migrations'),
        tables: CORE_TABLES,
        dialect: 'sqlite',
        name: 'migration',
    });
    expect(generated.status).toBe('generated');

    const driver = libsql({ url: `file:${join(siteDir, 'database.db')}` });
    db = driver.getInstance();
    await migrateToLatest(db, await loadAppMigrations(join(siteDir, 'migrations')), {
        allowUnorderedMigrations: true,
    });

    resetRuntime();
    setupTestConfig({ ...makeTestConfig(), db: driver });
});

afterAll(async () => {
    await db.destroy();
    await rm(siteDir, { recursive: true, force: true });
});

describe('a fresh generate from CORE_TABLES', () => {
    it('writes nothing more when generated again', async () => {
        const again = await generateMigrations({
            dir: join(siteDir, 'migrations'),
            tables: CORE_TABLES,
            dialect: 'sqlite',
            name: 'migration',
        });

        expect(again.status).toBe('no-changes');
    });

    it('creates every table and column Better Auth needs', async () => {
        // Better Auth expects a date column type; Astromech stores ISO text.
        expectConsole(
            'warn',
            /has a different type in the database\. Expected date but got TEXT/
        );
        const { toBeCreated, toBeAdded } = await getMigrations(getAuth().options);

        expect(toBeCreated).toEqual([]);
        expect(toBeAdded).toEqual([]);
    });

    it('takes the first admin through setup, and refuses a sign-up', async () => {
        const auth = getAuth();
        const created = await createFirstAdmin({
            email: 'first@test.dev',
            password: 'password123',
            name: 'First',
        });
        expect(created).toBe('created');

        const user = await db
            .selectFrom('users')
            .select(['id', 'role'])
            .where('email', '=', 'first@test.dev')
            .executeTakeFirstOrThrow();
        expect(user.role).toBe('admin');

        // Signing in writes the session row, so the generated `sessions` table
        // is exercised by the flow a new site runs.
        await auth.api.signInEmail({
            body: { email: 'first@test.dev', password: 'password123' },
        });
        const { rows } = await sql<{ kind: string }>`
            SELECT typeof(expires_at) AS kind FROM sessions WHERE user_id = ${user.id}
        `.execute(db);
        expect(rows.map((row) => row.kind)).toEqual(['text']);

        const refusal = await auth.api
            .signUpEmail({
                body: {
                    email: 'second@test.dev',
                    password: 'password123',
                    name: 'Second',
                },
            })
            .then(
                () => null,
                (error: unknown) => error as { body?: { code?: string } }
            );
        expect(refusal?.body?.code).toBe('SIGN_UP_CLOSED');
    });
});
