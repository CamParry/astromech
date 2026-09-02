/**
 * `GET /globals/:key` and `PUT /globals/:key` — the read and the write every
 * other route builds on. Status, envelope, the locale the URL addresses, and
 * the two answers an undeclared key gets.
 */

import type { Global } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { adminRole, roleWith, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, configWithGlobals, put } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
});

/** The `{ data }` body a successful read or write answers with. */
async function data(res: Response): Promise<Global> {
    return ((await res.json()) as { data: Global }).data;
}

describe('GET /globals/:key', () => {
    it('404s a declared global nothing has saved', async () => {
        const res = await app().request('/globals/site?full=true');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Global 'site' not found");
    });

    it('returns the saved fields in a { data } envelope', async () => {
        await app().request('/globals/site', put({ fields: { title: 'Astromech' } }));

        const res = await app().request('/globals/site?full=true');
        expect(res.status).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        expect(Object.keys(body)).toEqual(['data']);
        const global = (body as { data: Global }).data;
        expect(global.key).toBe('site');
        expect(global.locale).toBe('en');
        expect(global.fields).toEqual({ title: 'Astromech' });
    });

    it('reads the locale the query string names', async () => {
        await app().request('/globals/site', put({ fields: { title: 'English' } }));
        await app().request(
            '/globals/site?locale=de',
            put({ fields: { title: 'Deutsch' } })
        );

        const de = await app().request('/globals/site?locale=de&full=true');
        expect((await data(de)).fields).toEqual({ title: 'Deutsch' });
        const en = await app().request('/globals/site?full=true');
        expect((await data(en)).locale).toBe('en');
    });
});

describe('PUT /globals/:key', () => {
    it('creates the row on the first write and returns the global', async () => {
        const res = await app().request(
            '/globals/site',
            put({ fields: { title: 'Astromech' } })
        );
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.key).toBe('site');
        expect(global.status).toBe('unpublished');
        expect(global.fields).toEqual({ title: 'Astromech' });
    });

    it('writes one locale of a translatable global', async () => {
        await app().request('/globals/site', put({ fields: { title: 'English' } }));
        const res = await app().request(
            '/globals/site?locale=de',
            put({ fields: { title: 'Deutsch' } })
        );
        expect(res.status).toBe(200);
        const global = await data(res);
        expect(global.locale).toBe('de');
        expect(global.locales.sort()).toEqual(['de', 'en']);
    });

    it('422s a locale a non-translatable global has no row for', async () => {
        const res = await app().request(
            '/globals/contact?locale=de',
            put({ fields: { email: 'a@b.dev' } })
        );
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { code: string; details: { form: string[] } };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details.form[0]).toContain('not translatable');
    });

    it('422s a body with no fields key', async () => {
        const res = await app().request('/globals/contact', put({}));
        expect(res.status).toBe(422);
    });

    it('400s an unparseable body', async () => {
        const res = await app().request('/globals/contact', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json',
        });
        expect(res.status).toBe(400);
    });
});

describe('an undeclared key', () => {
    it('404s a role that could read it', async () => {
        const res = await app(adminRole).request('/globals/nope?full=true');
        expect(res.status).toBe(404);
    });

    it('403s a role that could not — existence is not enumerable', async () => {
        const res = await app(roleWith([])).request('/globals/nope?full=true');
        expect(res.status).toBe(403);
    });

    it('404s a write from a privileged role, 403s one from any other', async () => {
        const allowed = await app(adminRole).request(
            '/globals/nope',
            put({ fields: {} })
        );
        expect(allowed.status).toBe(404);
        const denied = await app(roleWith([])).request(
            '/globals/nope',
            put({ fields: {} })
        );
        expect(denied.status).toBe(403);
    });
});
