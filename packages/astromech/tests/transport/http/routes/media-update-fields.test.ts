/**
 * `PUT /media/:id` over the real router — every editable column round-trips.
 *
 * The route destructures the validated body by name, so a column can be added
 * to the schema, the service and the client and still be silently dropped
 * here. That is exactly what happened to `caption`: the service-level tests
 * passed because they call the Local API directly and never touch the route.
 * These assert through the HTTP layer, which is what the admin actually uses.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role, StorageDriver, User } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMediaRepository } from '@/media/repository';
import { mediaService } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

const adminRole: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'] as Role['permissions'],
    isBuiltIn: true,
};

function mountedApp(): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/media/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', adminRole);
        return next();
    });
    app.route('/media', mediaRouter);
    return app;
}

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await createMediaRepository().create({
        filename: 'a.png',
        mimeType: 'image/png',
        size: 1,
    });
    id = row.id;
});

async function put(body: Record<string, unknown>): Promise<Response> {
    return mountedApp().request(`/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PUT /media/:id — editable columns', () => {
    it('persists alt through the route', async () => {
        expect((await put({ alt: 'an alt' })).status).toBe(200);
        expect((await mediaService.get({ id }))?.alt).toBe('an alt');
    });

    it('persists title through the route', async () => {
        expect((await put({ title: 'a title' })).status).toBe(200);
        expect((await mediaService.get({ id }))?.title).toBe('a title');
    });

    it('persists caption through the route', async () => {
        expect((await put({ caption: 'a caption' })).status).toBe(200);
        expect((await mediaService.get({ id }))?.caption).toBe('a caption');
    });

    it('persists all three in one request', async () => {
        const res = await put({ alt: 'A', title: 'T', caption: 'C' });
        expect(res.status).toBe(200);
        const found = await mediaService.get({ id });
        expect([found?.alt, found?.title, found?.caption]).toEqual(['A', 'T', 'C']);
    });

    it('returns the updated values in the response body, not just in the stored row', async () => {
        const res = await put({ title: 'T', caption: 'C' });
        const body = (await res.json()) as { data: { title: string; caption: string } };
        expect(body.data.title).toBe('T');
        expect(body.data.caption).toBe('C');
    });

    it('leaves an omitted column alone', async () => {
        await put({ title: 'kept', caption: 'kept too' });
        await put({ alt: 'changed' });
        const found = await mediaService.get({ id });
        expect(found?.title).toBe('kept');
        expect(found?.caption).toBe('kept too');
    });
});
