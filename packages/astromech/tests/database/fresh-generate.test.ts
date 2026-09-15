/**
 * A new site's first `db:generate` and `db:init`: generate from `CORE_TABLES`
 * into an empty directory, apply the chain through the loader `db:init` uses,
 * and sign up through Better Auth against the result. The demo's chain cannot
 * stand in for this, because it was not generated from an empty directory.
 */

import type { DB } from '@/database/types';
import type { Client } from '@libsql/client';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateToLatest } from '@astromech/schema-engine';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { setupTestConfig } from '@tests/harness';
import { getMigrations } from 'better-auth/db/migration';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAppMigrations } from '@/database/app-migrations';
import { setDatabaseDriver } from '@/database/driver-registry';
import { generateMigrations } from '@/database/generate';
import { setDb } from '@/database/registry';
import { CORE_TABLES } from '@/database/tables';
import { getAuth } from '@/users/auth';

let siteDir: string;
let client: Client;
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

    client = createClient({ url: `file:${join(siteDir, 'database.db')}` });
    db = new Kysely<DB>({
        // `@libsql/kysely-libsql` pins an older `@libsql/core` Client type; the
        // runtime client is compatible (see the libsql driver).
        dialect: new LibsqlDialect({ client: client as never }),
        plugins: [new CamelCasePlugin()],
    });
    setDb(db);
    setDatabaseDriver({
        type: 'libsql',
        getInstance: () => db,
        supportsTransactions: true,
    });
    await migrateToLatest(db, await loadAppMigrations(siteDir), {
        allowUnorderedMigrations: true,
    });

    delete globalThis.__astromech?.auth;
    setupTestConfig();
});

afterAll(async () => {
    await db.destroy();
    client.close();
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
        const { toBeCreated, toBeAdded } = await getMigrations(getAuth().options);

        expect(toBeCreated).toEqual([]);
        expect(toBeAdded).toEqual([]);
    });

    it('lets the first sign-up in as admin, then closes sign-up', async () => {
        const auth = getAuth();
        await auth.api.signUpEmail({
            body: { email: 'first@test.dev', password: 'password123', name: 'First' },
        });

        const user = await db
            .selectFrom('users')
            .select(['id', 'role'])
            .where('email', '=', 'first@test.dev')
            .executeTakeFirstOrThrow();
        expect(user.role).toBe('admin');

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
