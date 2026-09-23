/**
 * `POST /media/:id/replace` over the real router. Service-level tests never touch
 * a route, so only these assert that the file arrives, the permission is
 * enforced, and a missing item answers 404 not 500.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { adminRole, noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { seedTestUser, testUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { createMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';

const mediaService = currentServices.media;

const fakeUser = testUser;

/** Reads media but may not upload — the role `media:upload` must keep out. */
const viewerRole: Role = {
    slug: 'viewer',
    name: 'Viewer',
    permissions: ['media:read', 'media:update'] as Role['permissions'],
    isBuiltIn: false,
};

function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/media/*', async (c, next) => {
        c.set('ctx', createAppContext({ user: fakeUser, role: role }));
        return next();
    });
    app.route('/media', mediaRouter);
    return app;
}

let id: string;

beforeEach(async () => {
    await seedTestUser(await createTestDb());
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await createMediaRepository().create(
        {
            filename: 'old.png',
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    id = row.id;
});

/** POST a multipart body to the replace route, optionally without the file part. */
async function postReplace(
    target: string,
    options?: { file?: File; role?: Role }
): Promise<Response> {
    const formData = new FormData();
    if (options?.file !== undefined) formData.append('file', options.file);
    return mountedApp(options?.role ?? adminRole).request(`/media/${target}/replace`, {
        method: 'POST',
        body: formData,
    });
}

function newFile(): File {
    return new File(['replacement bytes' as BlobPart], 'new.jpg', {
        type: 'image/jpeg',
    });
}

describe('POST /media/:id/replace', () => {
    it('swaps the file metadata and keeps the id', async () => {
        const file = newFile();
        const res = await postReplace(id, { file });
        expect(res.status).toBe(200);

        const body = (await res.json()) as { data: { id: string } };
        expect(body.data.id).toBe(id);

        const found = await mediaService.get({ id });
        expect(found?.filename).toBe('new.jpg');
        expect(found?.mimeType).toBe('image/jpeg');
        expect(found?.size).toBe(file.size);
    });

    it('returns the replaced item in the response body, not just in the stored row', async () => {
        const res = await postReplace(id, { file: newFile() });
        const body = (await res.json()) as {
            data: { filename: string; mimeType: string };
        };
        expect(body.data.filename).toBe('new.jpg');
        expect(body.data.mimeType).toBe('image/jpeg');
    });

    it('refuses a role without media:upload', async () => {
        const res = await postReplace(id, { file: newFile(), role: viewerRole });
        expect(res.status).toBe(403);
        expect((await mediaService.get({ id }))?.filename).toBe('old.png');
    });

    it('rejects a request with no file field', async () => {
        const res = await postReplace(id);
        expect(res.status).toBe(400);
        expect((await mediaService.get({ id }))?.filename).toBe('old.png');
    });

    it('answers 404 for an unknown id rather than throwing a 500', async () => {
        const res = await postReplace('does-not-exist', { file: newFile() });
        expect(res.status).toBe(404);
    });
});
