/**
 * `GET /globals/:key/versions` and the restore route, and the 409 a global with
 * `versioning: false` answers to both.
 */

import type { Global, GlobalVersion } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, configWithGlobals, json, put } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
});

/** Write `email` to `contact`, which versions by default. */
async function save(email: string): Promise<void> {
    const res = await app().request('/globals/contact', put({ fields: { email } }));
    expect(res.status).toBe(200);
}

async function versions(): Promise<GlobalVersion[]> {
    const res = await app().request('/globals/contact/versions');
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: GlobalVersion[] }).data;
}

describe('GET /globals/:key/versions', () => {
    it('lists a version per replaced state, newest first', async () => {
        // The first save replaces nothing, so three writes leave two versions.
        await save('one@b.dev');
        await save('two@b.dev');
        await save('three@b.dev');

        const listed = await versions();
        expect(listed.map((version) => version.version)).toEqual([2, 1]);
        expect(listed.map((version) => version.fields?.['email'])).toEqual([
            'two@b.dev',
            'one@b.dev',
        ]);
    });

    it('returns an empty list for a global saved once', async () => {
        await save('one@b.dev');
        expect(await versions()).toEqual([]);
    });
});

describe('POST /globals/:key/versions/:versionId/restore', () => {
    it('rolls the fields back to the named version', async () => {
        await save('one@b.dev');
        await save('two@b.dev');
        const [first] = await versions();

        const res = await app().request(
            `/globals/contact/versions/${first?.id}/restore`,
            json({})
        );
        expect(res.status).toBe(200);
        const global = ((await res.json()) as { data: Global }).data;
        expect(global.fields).toEqual({ email: 'one@b.dev' });
    });
});

describe('a global with versioning off', () => {
    it.each([
        ['GET', '/globals/theme/versions'],
        ['POST', '/globals/theme/versions/v1/restore'],
    ])('409s %s %s', async (method, path) => {
        await app().request('/globals/theme', put({ fields: { accent: 'red' } }));

        const res = await app().request(
            path,
            method === 'POST' ? json({}) : { method: 'GET' }
        );
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('capability_not_supported');
        expect(body.error.message).toBe(
            'Global "theme" does not support capability: versioning'
        );
    });
});
