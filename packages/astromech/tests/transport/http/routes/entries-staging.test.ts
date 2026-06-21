/**
 * HTTP route round-trips for forward versioning (staged entries):
 * POST/GET/DELETE `:type/:id/staged`, POST `:type/:id/staged/merge`, and
 * POST/DELETE `:type/:id/preview-token`.
 *
 * Mounts the root entries router in isolation with an injected user/role (Better
 * Auth sessions are out of scope here) against a config where `post` has the
 * `staging` capability enabled. The service layer's policy is pinned in
 * tests/services/entries/staging.test.ts — these tests own the route wiring:
 * status codes, the 409 duplicate-stage envelope (carrying `stagedId`), the
 * capability 409, and the permission matrix (merge = publish; the rest = update).
 *
 * Uses a per-test temp FILE db: `mergeStaged` runs in a storage transaction,
 * which poisons the harness `:memory:` base connection on later reads.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { setupTestConfig, makeTestConfig } from '@tests/harness.js';
import { setDb } from '@/database/registry.js';
import { entries as api } from '@/entries/service.js';
import { createEntriesRouter } from '@/transport/http/routes/entries.js';
import { rootEntryPermission } from '@/permissions/index.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { ResolvedConfig, Role, User } from '@/types/index.js';

const MIGRATIONS_FOLDER = fileURLToPath(
    new URL('../../../../../../apps/demo/drizzle', import.meta.url)
);

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

let dbCounter = 0;
let dbPath = '';
let resolved: ResolvedConfig;

beforeEach(async () => {
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-staging-http-${process.pid}-${dbCounter}.db`);
    const db = drizzle({ connection: { url: `file:${dbPath}` } });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    setDb(db);

    const cfg = makeTestConfig();
    if (cfg.entries.post) cfg.entries.post.staging = true; // versioning on + staging on
    resolved = setupTestConfig(cfg);
});

afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
        try {
            rmSync(`${dbPath}${suffix}`);
        } catch {
            // best-effort cleanup
        }
    }
});

/** Mount the root entries router with an injected role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/entries/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', role);
        return next();
    });
    app.route(
        '/entries',
        createEntriesRouter({
            lookup: (t) => resolved.entries[t],
            qualify: (t) => t,
            permissionFor: (t, a) => rootEntryPermission(t, a),
        })
    );
    return app;
}

describe('staged-entry routes — round-trip', () => {
    it('creates, gets, merges, then cleans up a staged change', async () => {
        const app = mountedApp(roleWith(['*']));
        const canonical = await api.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
            fields: { body: 'v1' },
            status: 'published',
        });

        // create
        const created = await app.request(`/entries/post/${canonical.id}/staged`, {
            method: 'POST',
        });
        expect(created.status).toBe(201);
        const stagedBody = (await created.json()) as {
            data: { id: string; stagedFor: string; status: string };
        };
        expect(stagedBody.data.stagedFor).toBe(canonical.id);
        expect(stagedBody.data.status).toBe('unpublished');
        const stagedId = stagedBody.data.id;

        // get
        const got = await app.request(`/entries/post/${canonical.id}/staged`);
        expect(got.status).toBe(200);
        expect(((await got.json()) as { data: { id: string } }).data.id).toBe(stagedId);

        // edit the staged row through the normal update route
        const edited = await app.request(`/entries/post/${stagedId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Updated', fields: { body: 'v2' } }),
        });
        expect(edited.status).toBe(200);

        // merge → canonical updated in place, status preserved (content-only)
        const merged = await app.request(`/entries/post/${canonical.id}/staged/merge`, {
            method: 'POST',
        });
        expect(merged.status).toBe(200);
        const mergedBody = (await merged.json()) as {
            data: { id: string; title: string; fields: { body: string }; status: string };
        };
        expect(mergedBody.data.id).toBe(canonical.id);
        expect(mergedBody.data.title).toBe('Updated');
        expect(mergedBody.data.fields.body).toBe('v2');
        expect(mergedBody.data.status).toBe('published');

        // staged change is gone
        const after = await app.request(`/entries/post/${canonical.id}/staged`);
        expect(((await after.json()) as { data: unknown }).data).toBeNull();
    });

    it('409 staged_entry_exists (carrying stagedId) on a duplicate stage', async () => {
        const app = mountedApp(roleWith(['*']));
        const canonical = await api.create({ type: 'post', title: 'X', slug: 'x' });

        const first = await app.request(`/entries/post/${canonical.id}/staged`, {
            method: 'POST',
        });
        const firstId = ((await first.json()) as { data: { id: string } }).data.id;

        const dup = await app.request(`/entries/post/${canonical.id}/staged`, {
            method: 'POST',
        });
        expect(dup.status).toBe(409);
        const dupBody = (await dup.json()) as {
            error: { code: string; details: { stagedId: string } };
        };
        expect(dupBody.error.code).toBe('staged_entry_exists');
        expect(dupBody.error.details.stagedId).toBe(firstId);
    });

    it('discards a staged change via DELETE', async () => {
        const app = mountedApp(roleWith(['*']));
        const canonical = await api.create({ type: 'post', title: 'D', slug: 'd' });
        await app.request(`/entries/post/${canonical.id}/staged`, { method: 'POST' });

        const del = await app.request(`/entries/post/${canonical.id}/staged`, {
            method: 'DELETE',
        });
        expect(del.status).toBe(200);

        const after = await app.request(`/entries/post/${canonical.id}/staged`);
        expect(((await after.json()) as { data: unknown }).data).toBeNull();
    });

    it('issues then revokes a preview token', async () => {
        const app = mountedApp(roleWith(['*']));
        const canonical = await api.create({ type: 'post', title: 'P', slug: 'p' });

        const issued = await app.request(`/entries/post/${canonical.id}/preview-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(issued.status).toBe(201);
        const token = ((await issued.json()) as { data: { token: string } }).data.token;
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        const revoked = await app.request(`/entries/post/${canonical.id}/preview-token`, {
            method: 'DELETE',
        });
        expect(revoked.status).toBe(200);
    });
});

describe('staged-entry routes — capability + permissions', () => {
    it('409 capability_not_supported when the type lacks staging', async () => {
        const app = mountedApp(roleWith(['*']));
        // `card` has no staging capability — the capability check fires before the
        // entry id is even resolved.
        const res = await app.request('/entries/card/anyid/staged', { method: 'POST' });
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'capability_not_supported'
        );
    });

    it('403 creating a staged change without entry update permission', async () => {
        const canonical = await api.create({ type: 'post', title: 'R', slug: 'r' });
        const app = mountedApp(roleWith(['entry:post:read']));
        const res = await app.request(`/entries/post/${canonical.id}/staged`, {
            method: 'POST',
        });
        expect(res.status).toBe(403);
    });

    it('403 merging with only update permission (merge requires publish)', async () => {
        const canonical = await api.create({ type: 'post', title: 'M', slug: 'm' });
        await api.createStaged({ type: 'post', id: canonical.id });
        const app = mountedApp(roleWith(['entry:post:update', 'entry:post:read']));
        const res = await app.request(`/entries/post/${canonical.id}/staged/merge`, {
            method: 'POST',
        });
        expect(res.status).toBe(403);
    });
});
