/**
 * POST /cron/run — auth-branch coverage.
 *
 * Mounts cronRouter on a minimal Hono app over the in-memory harness.
 * Registers a due job whose handler flips a flag so a 200 also proves
 * onTick ran due-eval, not a no-op.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { registerCronJob } from '@/cron/registry.js';
import { cronRouter } from '@/transport/http/routes/cron.js';

// Mock resolveSessionUser so tests control the session branch without a real
// Better Auth stack.
vi.mock('@/transport/http/middleware/auth.js', () => ({
    resolveSessionUser: vi.fn(),
}));

import { resolveSessionUser } from '@/transport/http/middleware/auth.js';

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
    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();

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

    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();
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

    const { getDb } = await import('@/db/registry.js');
    const { cronTable } = await import('@/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const { onTick } = await import('@/cron/runner.js');

    // Seed the row (initial nextRun will be future).
    await onTick(new Date('2024-01-01T00:00:00.000Z'));

    // Force nextRun into the past so the poke tick fires the handler.
    await getDb()
        .update(cronTable)
        .set({ nextRun: new Date('2023-01-01T00:00:00.000Z'), lock: null })
        .where(eq(cronTable.name, 'probe'));

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
