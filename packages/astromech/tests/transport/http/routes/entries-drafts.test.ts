/**
 * HTTP route round-trips for drafts: PUT `:type/:id` on a published entry
 * saves a draft, GET `:type/:id?draft=true` reads it, and DELETE
 * `:type/:id/draft` discards it. The service policy is pinned in
 * tests/entries/drafts.test.ts; these tests own the wiring: status codes, the
 * query flag and the permissions each route demands.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { seedTestUser, testUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { onError } from '@/transport/http/middleware/errors';
import { createEntriesRouter } from '@/transport/http/routes/entries';

const api = currentServices.entries;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

beforeEach(async () => {
    await seedTestUser(await createTestDb());
    setupTestConfig(makeTestConfig());
});

/** Mount the root entries router with an injected role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.onError(onError);
    app.use('/entries/*', async (c, next) => {
        c.set('ctx', createAppContext({ user: testUser, role }));
        return next();
    });
    app.route('/entries', createEntriesRouter());
    return app;
}

async function publishedPost() {
    return api.create({
        type: 'post',
        data: { title: 'Live', fields: { body: 'live' }, status: 'published' },
    });
}

type EntryBody = { data: { title: string; hasDraft: boolean } };

describe('draft routes — round-trip', () => {
    it('saves a draft through PUT, reads it with ?draft=true, and discards it', async () => {
        const app = mountedApp(roleWith(['*']));
        const post = await publishedPost();

        const saved = await app.request(`/entries/post/${post.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Changed' }),
        });
        expect(saved.status).toBe(200);
        expect(((await saved.json()) as EntryBody).data).toMatchObject({
            title: 'Changed',
            hasDraft: true,
        });

        const live = await app.request(`/entries/post/${post.id}`);
        expect(((await live.json()) as EntryBody).data).toMatchObject({
            title: 'Live',
            hasDraft: true,
        });

        const draft = await app.request(`/entries/post/${post.id}?draft=true`);
        expect(((await draft.json()) as EntryBody).data.title).toBe('Changed');

        const discarded = await app.request(`/entries/post/${post.id}/draft`, {
            method: 'DELETE',
        });
        expect(discarded.status).toBe(200);
        expect(((await discarded.json()) as EntryBody).data).toMatchObject({
            title: 'Live',
            hasDraft: false,
        });

        const again = await app.request(`/entries/post/${post.id}/draft`, {
            method: 'DELETE',
        });
        expect(again.status).toBe(404);
    });

    it('discards the draft of the locale the query names', async () => {
        const app = mountedApp(roleWith(['*']));
        const post = await publishedPost();
        await api.update({
            type: 'post',
            id: post.id,
            locale: 'de',
            data: { title: 'De', status: 'published' },
        });
        await api.update({
            type: 'post',
            id: post.id,
            locale: 'de',
            data: { title: 'De2' },
        });

        const english = await app.request(`/entries/post/${post.id}/draft`, {
            method: 'DELETE',
        });
        expect(english.status).toBe(404);

        const german = await app.request(`/entries/post/${post.id}/draft?locale=de`, {
            method: 'DELETE',
        });
        expect(german.status).toBe(200);
        expect(((await german.json()) as EntryBody).data.title).toBe('De');
    });
});

describe('draft routes — permissions', () => {
    it('needs update to discard a draft', async () => {
        const post = await publishedPost();
        await api.update({ type: 'post', id: post.id, data: { title: 'Changed' } });

        const reader = mountedApp(roleWith(['entry:post:read']));
        const refused = await reader.request(`/entries/post/${post.id}/draft`, {
            method: 'DELETE',
        });
        expect(refused.status).toBe(403);

        const editor = mountedApp(roleWith(['entry:post:read', 'entry:post:update']));
        const allowed = await editor.request(`/entries/post/${post.id}/draft`, {
            method: 'DELETE',
        });
        expect(allowed.status).toBe(200);
    });

    it('needs entry:read:full to read a draft', async () => {
        const post = await publishedPost();
        await api.update({ type: 'post', id: post.id, data: { title: 'Changed' } });

        const reader = mountedApp(roleWith(['entry:post:read']));
        expect((await reader.request(`/entries/post/${post.id}?draft=true`)).status).toBe(
            403
        );

        const full = mountedApp(roleWith(['entry:post:read', 'entry:read:full']));
        const read = await full.request(`/entries/post/${post.id}?draft=true`);
        expect(read.status).toBe(200);
        expect(((await read.json()) as EntryBody).data.title).toBe('Changed');
    });
});
