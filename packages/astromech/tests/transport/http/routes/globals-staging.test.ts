/**
 * The four staged-change routes plus `PUT ?staged=true`, the 409 a second
 * `create` answers with, and the 409 every one of them answers for a global that
 * does not declare `staging`.
 */

import type { Global } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { roleWith, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, configWithGlobals, json, put } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
    const saved = await app().request(
        '/globals/site',
        put({ fields: { title: 'Live' } })
    );
    expect(saved.status).toBe(200);
});

async function data(res: Response): Promise<Global> {
    return ((await res.json()) as { data: Global }).data;
}

describe('POST /globals/:key/staged', () => {
    it('201s with a copy of the canonical row', async () => {
        const res = await app().request('/globals/site/staged', json({}));
        expect(res.status).toBe(201);
        const global = await data(res);
        expect(global.staged).toBe(true);
        expect(global.fields).toEqual({ title: 'Live' });
    });

    it('patches the body’s `data` over the copy', async () => {
        const res = await app().request(
            '/globals/site/staged',
            json({ data: { fields: { title: 'Next' } } })
        );
        expect(res.status).toBe(201);
        expect((await data(res)).fields).toEqual({ title: 'Next' });
    });

    it('422s a `data` the update schema rejects', async () => {
        const res = await app().request(
            '/globals/site/staged',
            json({ data: { fields: 'nope' } })
        );
        expect(res.status).toBe(422);
    });

    it('409s a second create, naming the locale the existing one holds', async () => {
        await app().request('/globals/site/staged', json({}));

        const res = await app().request('/globals/site/staged', json({}));
        expect(res.status).toBe(409);
        const body = (await res.json()) as {
            error: { code: string; details: { locale: string } };
        };
        expect(body.error.code).toBe('staged_global_exists');
        expect(body.error.details.locale).toBe('en');
    });
});

describe('GET /globals/:key/staged', () => {
    it('returns the staged change, and null when there is none', async () => {
        const absent = await app().request('/globals/site/staged');
        expect(absent.status).toBe(200);
        expect(await data(absent)).toBeNull();

        await app().request('/globals/site/staged', json({}));
        const present = await app().request('/globals/site/staged');
        expect((await data(present)).staged).toBe(true);
    });

    it('is also reachable as ?staged=true on the read route', async () => {
        await app().request(
            '/globals/site/staged',
            json({ data: { fields: { title: 'Next' } } })
        );

        const res = await app().request('/globals/site?staged=true&full=true');
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.staged).toBe(true);
        expect(global.fields).toEqual({ title: 'Next' });
    });
});

describe('PUT /globals/:key?staged=true', () => {
    it('edits the staged row and leaves the canonical alone', async () => {
        await app().request('/globals/site/staged', json({}));

        const res = await app().request(
            '/globals/site?staged=true',
            put({ fields: { title: 'Draft' } })
        );
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.staged).toBe(true);
        expect(global.fields).toEqual({ title: 'Draft' });

        const canonical = await app().request('/globals/site?full=true');
        expect((await data(canonical)).fields).toEqual({ title: 'Live' });
    });

    it('404s when that locale has no staged change', async () => {
        const res = await app().request(
            '/globals/site?staged=true',
            put({ fields: { title: 'Draft' } })
        );
        expect(res.status).toBe(404);
    });

    it('needs only global:<key>:update, as an unstaged write does', async () => {
        await app().request('/globals/site/staged', json({}));

        const res = await app(roleWith(['global:site:update'])).request(
            '/globals/site?staged=true',
            put({ fields: { title: 'Draft' } })
        );
        expect(res.status).toBe(200);
    });
});

describe('POST /globals/:key/staged/merge', () => {
    it('makes the staged fields the canonical ones', async () => {
        await app().request(
            '/globals/site/staged',
            json({ data: { fields: { title: 'Next' } } })
        );

        const res = await app().request('/globals/site/staged/merge', json({}));
        expect(res.status).toBe(200);
        expect((await data(res)).fields).toEqual({ title: 'Next' });

        const canonical = await app().request('/globals/site?full=true');
        expect((await data(canonical)).fields).toEqual({ title: 'Next' });
        expect(await data(await app().request('/globals/site/staged'))).toBeNull();
    });
});

describe('DELETE /globals/:key/staged', () => {
    it('discards the staged change and answers { success: true }', async () => {
        await app().request('/globals/site/staged', json({}));

        const res = await app().request('/globals/site/staged', { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(await data(await app().request('/globals/site/staged'))).toBeNull();
    });
});

describe('a global that does not declare staging', () => {
    beforeEach(async () => {
        await app().request('/globals/contact', put({ fields: { email: 'a@b.dev' } }));
    });

    it.each([
        ['POST', '/globals/contact/staged'],
        ['GET', '/globals/contact/staged'],
        ['POST', '/globals/contact/staged/merge'],
        ['DELETE', '/globals/contact/staged'],
        ['GET', '/globals/contact?staged=true&full=true'],
    ])('409s %s %s', async (method, path) => {
        const res = await app().request(path, method === 'POST' ? json({}) : { method });
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('capability_not_supported');
        expect(body.error.message).toBe(
            'Global "contact" does not support capability: staging'
        );
    });
});
