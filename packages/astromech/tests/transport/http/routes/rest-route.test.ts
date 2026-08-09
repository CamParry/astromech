/**
 * The generic handler behind the REST route table — the two facts that belong to
 * the machinery rather than to any one route.
 *
 * `PUT /media/:id` is the probe: its method takes `{ id, data }`, so it is the
 * converted route where the argument shape could leak into the response.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, roleWith } from '@tests/mount-router';
import { setStorageDriver } from '@/storage/registry';
import { createMediaStorage } from '@/media/storage';
import { mediaRouter } from '@/transport/http/routes/media';
import type { Role, StorageDriver } from '@/types/index';

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

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await createMediaStorage().create({
        filename: 'a.png',
        mimeType: 'image/png',
        size: 1,
    });
    id = row.id;
});

/** `PUT /media/:id` with a raw body string, under `role`. */
function put(role: Role, body: string): Promise<Response> | Response {
    return mountRouter('/media', mediaRouter, role).request(`/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

const allowed = roleWith(['media:update']);
const denied = roleWith([]);

describe('validation-error field paths', () => {
    it('reports the field the caller sent, not the argument key it lands under', async () => {
        const res = await put(allowed, JSON.stringify({ alt: 42 }));
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { details: { fields: Record<string, string[]> } };
        };
        expect(Object.keys(body.error.details.fields)).toEqual(['alt']);
    });
});

describe('permission is answered before the body is read', () => {
    it('403s an unauthorized request whose body would also fail validation', async () => {
        const res = await put(denied, JSON.stringify({ alt: 42 }));
        expect(res.status).toBe(403);
    });

    it('403s an unauthorized request whose body is not JSON at all', async () => {
        const res = await put(denied, 'not json');
        expect(res.status).toBe(403);
    });

    it('400s an authorized request whose body is not JSON', async () => {
        const res = await put(allowed, 'not json');
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
    });
});
