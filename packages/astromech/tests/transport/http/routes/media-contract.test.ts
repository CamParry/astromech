/**
 * The five `routes/media.ts` handlers that `media-replace.test.ts` and
 * `media-update-fields.test.ts` do not already own: list, get, usage, upload
 * and delete. Status, envelope, the keys each returns, and the permission each
 * enforces.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, roleWith } from '@tests/mount-router';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';
import { createMediaStorage } from '@/media/storage';
import { mediaService } from '@/media/service';
import type { Media, Role, StorageDriver } from '@/types/index';

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

function app(role: Role = adminRole) {
    return mountRouter('/media', mediaRouter, role);
}

let pngId: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await createMediaStorage().create({
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 12,
    });
    pngId = row.id;
});

describe('GET /media', () => {
    it('returns { data, pagination } straight from the service', async () => {
        const res = await app().request('/media');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            data: Media[];
            pagination: { total: number } | null;
        };
        expect(Object.keys(body).sort()).toEqual(['data', 'pagination']);
        expect(body.data.map((m) => m.filename)).toEqual(['photo.png']);
        expect(body.pagination?.total).toBe(1);
    });

    it('filters on the mimeType bucket', async () => {
        await createMediaStorage().create({
            filename: 'notes.pdf',
            mimeType: 'application/pdf',
            size: 3,
        });

        const images = await app().request('/media?mimeType=images');
        expect(((await images.json()) as { data: Media[] }).data).toHaveLength(1);

        const documents = await app().request('/media?mimeType=documents');
        expect(
            ((await documents.json()) as { data: Media[] }).data.map((m) => m.filename)
        ).toEqual(['notes.pdf']);
    });

    it('ignores an unrecognised mimeType bucket rather than rejecting it', async () => {
        const res = await app().request('/media?mimeType=spreadsheets');
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: Media[] }).data).toHaveLength(1);
    });

    it('honours search, limit=all and an allowed sort field', async () => {
        await createMediaStorage().create({
            filename: 'apple.png',
            mimeType: 'image/png',
            size: 1,
        });

        const searched = await app().request('/media?search=apple');
        expect(((await searched.json()) as { data: Media[] }).data).toHaveLength(1);

        const all = await app().request('/media?limit=all');
        expect(((await all.json()) as { pagination: unknown }).pagination).toBeNull();

        const sorted = await app().request('/media?sort=filename&dir=asc');
        expect(
            ((await sorted.json()) as { data: Media[] }).data.map((m) => m.filename)
        ).toEqual(['apple.png', 'photo.png']);
    });

    it('403s without media:read', async () => {
        const res = await app(roleWith([])).request('/media');
        expect(res.status).toBe(403);
    });
});

describe('GET /media/:id', () => {
    it('returns { data: media }', async () => {
        const res = await app().request(`/media/${pngId}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Media };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(pngId);
        expect(body.data.filename).toBe('photo.png');
        expect(body.data.mimeType).toBe('image/png');
    });

    it('404s an unknown id', async () => {
        const res = await app().request('/media/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Media 'nope' not found");
    });

    it('403s without media:read', async () => {
        const res = await app(roleWith([])).request(`/media/${pngId}`);
        expect(res.status).toBe(403);
    });
});

describe('GET /media/:id/usage', () => {
    it('returns { data } with a reference list per referencing domain', async () => {
        const res = await app().request(`/media/${pngId}/usage`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: unknown[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toEqual([]);
    });

    it('404s an unknown id — the handler pre-flights media.get', async () => {
        const res = await app().request('/media/nope/usage');
        expect(res.status).toBe(404);
    });

    it('403s without media:read', async () => {
        const res = await app(roleWith([])).request(`/media/${pngId}/usage`);
        expect(res.status).toBe(403);
    });
});

describe('POST /media/upload', () => {
    async function upload(role: Role = adminRole, file?: File): Promise<Response> {
        const formData = new FormData();
        if (file !== undefined) formData.append('file', file);
        return app(role).request('/media/upload', { method: 'POST', body: formData });
    }

    it('stores the file and returns { data: media } with 201', async () => {
        const res = await upload(
            adminRole,
            new File(['bytes' as BlobPart], 'new.jpg', { type: 'image/jpeg' })
        );
        expect(res.status).toBe(201);
        const body = (await res.json()) as { data: Media };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.filename).toBe('new.jpg');
        expect(body.data.mimeType).toBe('image/jpeg');
        expect(await mediaService.get({ id: body.data.id })).not.toBeNull();
    });

    it('400s a request with no file part', async () => {
        const res = await upload();
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
        expect(body.error.message).toBe('A file field is required');
    });

    it('403s without media:upload', async () => {
        const res = await upload(
            roleWith(['media:read']),
            new File(['bytes' as BlobPart], 'new.jpg', { type: 'image/jpeg' })
        );
        expect(res.status).toBe(403);
    });
});

describe('PUT /media/:id', () => {
    function put(role: Role, body: unknown): Promise<Response> | Response {
        return app(role).request(`/media/${pngId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    it('403s with media:read but not media:update', async () => {
        const res = await put(roleWith(['media:read']), { alt: 'nope' });
        expect(res.status).toBe(403);
    });

    it('422s a body whose alt is not a string', async () => {
        const res = await put(adminRole, { alt: 42 });
        expect(res.status).toBe(422);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'VALIDATION_FAILED'
        );
    });
});

describe('DELETE /media/:id', () => {
    it('returns { success: true } and removes the item', async () => {
        const res = await app().request(`/media/${pngId}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(await mediaService.get({ id: pngId })).toBeNull();
    });

    it('403s without media:delete', async () => {
        const res = await app(roleWith(['media:read'])).request(`/media/${pngId}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(403);
        expect(await mediaService.get({ id: pngId })).not.toBeNull();
    });
});
