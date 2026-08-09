/**
 * POST /cron/run — auth-branch coverage.
 *
 * Mounts cronRouter on a minimal Hono app over the in-memory harness.
 * Registers a due job whose handler flips a flag so a 200 also proves
 * onTick ran due-eval, not a no-op.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Updateable } from 'kysely';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { registerCronJob } from '@/cron/registry';
import { cronRouter } from '@/transport/http/routes/cron';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/schema';
import type { DB } from '@/database/types';

// Mock resolveSessionUser so tests control the session branch without a real
// Better Auth stack.
vi.mock('@/users/session', () => ({
    resolveSessionUser: vi.fn(),
}));

import { resolveSessionUser } from '@/users/session';
import { globals } from '@/utilities/registry';

const mockResolveSessionUser = vi.mocked(resolveSessionUser);

/** Minimal app: just the cron router. */
function makeApp(): OpenAPIHono {
    const app = new OpenAPIHono();
    app.route('/cron', cronRouter);
    return app;
}

/** POST /cron/run with optional Authorization header. */
function poke(app: OpenAPIHono, authHeader?: string): Response | Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    return app.request('/cron/run', { method: 'POST', headers });
}

const SECRET = 'test-secret-abc';

// Save and restore ASTROMECH_CRON_SECRET so tests don't bleed into each other.
let originalSecret: string | undefined;

beforeEach(async () => {
    // Reset cron globals.
    delete globalThis.__astromech?.cronJobs;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();

    // Reset session mock.
    mockResolveSessionUser.mockReset();
    mockResolveSessionUser.mockResolvedValue(null);

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

    delete globalThis.__astromech?.cronJobs;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
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
    await onTick(new Date('2024-01-01T00:00:00.000Z'));

    // Force nextRun into the past so the poke tick fires the handler.
    const db = getDb() as Kysely<DB>;
    await db
        .updateTable('_astromech_cron')
        .set(
            encodePatchWith(cronTable, {
                nextRun: new Date('2023-01-01T00:00:00.000Z'),
                lock: null,
            }) as unknown as Updateable<DB['_astromech_cron']>
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
        const res = await poke(app);

        expect(res.status).toBe(401);
        expect(ran).toBe(false);
    });

    it('200 with correct bearer token when secret is set — due handler RUNS', async () => {
        process.env.ASTROMECH_CRON_SECRET = SECRET;

        const ref = await seedDueJob();

        const app = makeApp();
        const res = await poke(app, `Bearer ${SECRET}`);

        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean };
        expect(body.success).toBe(true);
        expect(ref.ran).toBe(true);
    });

    it('401 with wrong bearer token when secret is set — handler does NOT run', async () => {
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
        const res = await poke(app, 'Bearer wrong-secret');

        expect(res.status).toBe(401);
        expect(ran).toBe(false);
    });

    it('200 with admin session (no bearer) — due handler RUNS', async () => {
        mockResolveSessionUser.mockResolvedValue({
            user: { id: 'u1', email: 'admin@test.dev' } as never,
            role: { slug: 'admin', name: 'Admin', permissions: [], isBuiltIn: true },
            session: { id: 's1', userId: 'u1' } as never,
        });

        const ref = await seedDueJob();

        const app = makeApp();
        const res = await poke(app); // no auth header → falls through to session check

        expect(res.status).toBe(200);
        expect(ref.ran).toBe(true);
    });

    it('bearer path succeeds even when resolveSessionUser returns null', async () => {
        process.env.ASTROMECH_CRON_SECRET = SECRET;
        // resolveSessionUser is already mocked to return null in beforeEach.

        const ref = await seedDueJob();

        const app = makeApp();
        const res = await poke(app, `Bearer ${SECRET}`);

        expect(res.status).toBe(200);
        expect(ref.ran).toBe(true);
        // Bearer path must NOT have called resolveSessionUser.
        expect(mockResolveSessionUser).not.toHaveBeenCalled();
    });
});
