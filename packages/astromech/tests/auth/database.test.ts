/**
 * Better Auth queries through the app's own Kysely instance, so on a local
 * SQLite file its writes wait for an open app transaction to commit rather
 * than failing with SQLITE_BUSY.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService, usersService } from '@/app-context/services';
import { getAuth } from '@/auth/better-auth';
import { transaction } from '@/database/transaction';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';

const EMAIL = 'reset@test.dev';

let db: Kysely<DB>;
let basePath: string;

// `getAuth()` binds to the database registered when it is first asked for, so
// the registry slot is cleared with each fresh database.
beforeEach(async () => {
    delete globalThis.__astromech?.auth;
    db = await createTestDb();
    basePath = setupTestConfig().basePath;
});

/** A password reset request: one user lookup, then a verification row insert. */
function requestReset(): Promise<Response> {
    return getAuth().handler(
        new Request(`http://localhost${basePath}/api/auth/request-password-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: EMAIL,
                redirectTo: `${basePath}/reset-password`,
            }),
        })
    );
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Better Auth beside an open app transaction', () => {
    it('writes once the transaction commits instead of failing with SQLITE_BUSY', async () => {
        await usersService.create({
            data: { email: EMAIL, name: 'Reset', role: DEFAULT_ROLE_SLUG },
        });

        let commit!: () => void;
        const held = new Promise<void>((resolve) => {
            commit = resolve;
        });
        // Held open across a timer, as a transaction awaiting a hook's I/O is.
        const appWrite = transaction(async () => {
            await entriesService.create({
                type: 'note',
                data: { title: 'During', fields: { body: 'x' } },
            });
            await held;
        });
        await wait(0);

        const reset = requestReset();
        await wait(50);
        commit();
        await appWrite;

        expect((await reset).status).toBe(200);
        const { rows } = await sql<{ count: number }>`
            SELECT count(*) AS count FROM verifications
        `.execute(db);
        expect(Number(rows[0]?.count)).toBe(1);
    });
});
