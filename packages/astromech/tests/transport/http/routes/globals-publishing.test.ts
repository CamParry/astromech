/**
 * `publish`, `unpublish` and `schedule` over the router, and the 409 a global
 * with `statuses: false` answers to all three.
 */

import type { Global } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, configWithGlobals, json, put } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
    const saved = await app().request(
        '/globals/site',
        put({ fields: { title: 'Astromech' } })
    );
    expect(saved.status).toBe(200);
});

async function data(res: Response): Promise<Global> {
    return ((await res.json()) as { data: Global }).data;
}

describe('POST /globals/:key/publish', () => {
    it('publishes and stamps publishedAt', async () => {
        const res = await app().request('/globals/site/publish', json({}));
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.status).toBe('published');
        expect(global.publishedAt).not.toBeNull();
    });

    it('publishes the locale the query string names', async () => {
        await app().request('/globals/site?locale=de', put({ fields: { title: 'DE' } }));
        const res = await app().request('/globals/site/publish?locale=de', json({}));

        expect((await data(res)).locale).toBe('de');
        const en = await app().request('/globals/site?full=true');
        expect((await data(en)).status).toBe('unpublished');
    });
});

describe('POST /globals/:key/unpublish', () => {
    it('takes a published global back off', async () => {
        await app().request('/globals/site/publish', json({}));
        const res = await app().request('/globals/site/unpublish', json({}));

        expect(res.status).toBe(200);
        expect((await data(res)).status).toBe('unpublished');
    });
});

describe('POST /globals/:key/schedule', () => {
    it('schedules a future publication', async () => {
        const res = await app().request(
            '/globals/site/schedule',
            json({ publishedAt: '2099-01-01T00:00:00.000Z' })
        );
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.status).toBe('scheduled');
        expect(global.publishedAt).toBe('2099-01-01T00:00:00.000Z');
    });

    it('422s a publishedAt that is not a date', async () => {
        const res = await app().request(
            '/globals/site/schedule',
            json({ publishedAt: 'soon' })
        );
        expect(res.status).toBe(422);
    });
});

describe('a global with statuses off', () => {
    it.each(['publish', 'unpublish', 'schedule'])('409s %s', async (action) => {
        await app().request('/globals/banner', put({ fields: { message: 'Hi' } }));

        const res = await app().request(`/globals/banner/${action}`, json({}));
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('capability_not_supported');
        expect(body.error.message).toBe(
            'Global "banner" does not support capability: statuses'
        );
    });
});
