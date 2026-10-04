/**
 * POST /cron/run — auth-branch coverage.
 *
 * Mounts cronRouter on a minimal Hono app over the test database.
 * Registers a due job whose handler flips a flag so a 200 also proves
 * onTick ran due-eval, not a no-op.
 */

import type { DB } from '@/database/types';
import type { RequestScope } from '@/request-scope/request-scope';
import type { Role, User } from '@/types/index';
import type { Kysely } from 'kysely';
import { OpenAPIHono } from '@hono/zod-openapi';
import { adminRole } from '@tests/fixtures';
import { createTestDb, makeTestConfig, requestAs, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { registerCronJob } from '@/cron/registry';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/tables';
import { runInRequestScope } from '@/request-scope/request-scope';
import { cronRouter } from '@/transport/http/routes/cron';

/** Minimal app: the cron router alone. */
function makeApp(): OpenAPIHono {
    const app = new OpenAPIHono();
    app.route('/cron', cronRouter);
    return app;
}

/** A request with no session. */
const signedOut = { user: null, role: null };

/** POST /cron/run as `identity`, with an optional Authorization header. */
function poke(
    app: OpenAPIHono,
    identity: { user: User | null; role: Role | null },
    authHeader?: string
): Promise<Response> {
    return requestAs(app, identity, '/cron/run', pokeInit(authHeader));
}

/** The request init for a poke, with an optional Authorization header. */
function pokeInit(authHeader?: string): RequestInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    return { method: 'POST', headers };
}

const SECRET = 'test-secret-abc';

// Save and restore ASTROMECH_CRON_SECRET so tests don't bleed into each other.
let originalSecret: string | undefined;

beforeEach(async () => {
    // Reset env secret.
    originalSecret = process.env.ASTROMECH_CRON_SECRET;
    delete process.env.ASTROMECH_CRON_SECRET;

    // Spin up a fresh in-memory DB + config so onTick can run.
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

afterEach(() => {
    // Restore env secret.
    if (originalSecret === undefined) {
        delete process.env.ASTROMECH_CRON_SECRET;
    } else {
        process.env.ASTROMECH_CRON_SECRET = originalSecret;
    }
});

/**
 * Seed a "probe" cron job row into the DB, then force its nextRun to the past
 * so the next tick will treat it as due. Returns a ref object whose `.ran`
 * property flips true when the handler fires.
 */
async function seedDueJob(): Promise<{ ran: boolean }> {
    const ref = { ran: false };

    registerCronJob({
        name: 'probe',
        schedule: '* * * * *',
        handler: async () => {
            ref.ran = true;
        },
    });

    const { getDb } = await import('@/database/registry');
    const { onTick } = await import('@/cron/runner');

    // Seed the row (initial nextRun will be future).
    await onTick(new Date('2024-01-01T00:00:00.000Z'), systemAppContext());

    // Force nextRun into the past so the poke tick fires the handler.
    const db = getDb() as Kysely<DB>;
    await db
        .updateTable('_astromech_cron')
        .set(
            encodePatchWith(cronTable, {
                nextRun: new Date('2023-01-01T00:00:00.000Z'),
                lock: null,
            })
        )
        .where('name', '=', 'probe')
        .execute();

    return ref;
}

describe('POST /cron/run — auth branches', () => {
    it('401 with no auth header, no session, and secret unset — handler does NOT run', async () => {
        let ran = false;
        registerCronJob({
            name: 'probe',
            schedule: '* * * * *',
            handler: async () => {
                ran = true;
            },
        });

        const app = makeApp();
        const res = await poke(app, signedOut);

        expect(res.status).toBe(401);
        expect(ran).toBe(false);
    });

    it('200 with correct bearer token when secret is set — due handler RUNS', async () => {
        process.env.ASTROMECH_CRON_SECRET = SECRET;

        const ref = await seedDueJob();

        const app = makeApp();
        const res = await poke(app, signedOut, `Bearer ${SECRET}`);

        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean };
        expect(body.success).toBe(true);
        expect(ref.ran).toBe(true);
    });

    it.each([
        ['a wrong token', 'Bearer wrong-secret'],
        ['a prefix of the secret', `Bearer ${SECRET.slice(0, -1)}`],
        ['the secret with a suffix', `Bearer ${SECRET}x`],
        ['the secret without the scheme', SECRET],
    ])(
        '401 with %s when secret is set — handler does NOT run',
        async (_label, header) => {
            process.env.ASTROMECH_CRON_SECRET = SECRET;

            let ran = false;
            registerCronJob({
                name: 'probe',
                schedule: '* * * * *',
                handler: async () => {
                    ran = true;
                },
            });

            const app = makeApp();
            const res = await poke(app, signedOut, header);

            expect(res.status).toBe(401);
            expect(ran).toBe(false);
        }
    );

    it('200 with admin session (no bearer) — due handler RUNS', async () => {
        const admin = await currentServices.users.create({
            data: { email: 'admin@test.dev', name: 'Admin', role: 'admin' },
        });

        const ref = await seedDueJob();

        const app = makeApp();
        // No auth header, so the route falls through to the session check.
        const res = await poke(app, { user: admin, role: adminRole });

        expect(res.status).toBe(200);
        expect(ref.ran).toBe(true);
    });

    it('bearer path succeeds without resolving a session', async () => {
        process.env.ASTROMECH_CRON_SECRET = SECRET;

        const ref = await seedDueJob();

        // A scope with no identity: resolving the session would fill `user`.
        const request = new Request(
            'http://localhost/cron/run',
            pokeInit(`Bearer ${SECRET}`)
        );
        const scope: RequestScope = { request };
        const app = makeApp();
        const res = await runInRequestScope(scope, async () => app.fetch(request));

        expect(res.status).toBe(200);
        expect(ref.ran).toBe(true);
        // Bearer path must NOT have resolved a session.
        expect(scope.user).toBeUndefined();
    });
});
