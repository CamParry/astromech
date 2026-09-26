/**
 * `GET /globals/:key/versions`, the read and restore routes for one version,
 * and the 409 a global with `versioning: false` answers to each.
 */

import type { Global, GlobalVersion, VersionMetadata } from '@/types/index';
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

async function versions(): Promise<VersionMetadata[]> {
    const res = await app().request('/globals/contact/versions');
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: VersionMetadata[] }).data;
}

/** Read version `version` of `contact`. */
async function read(version: number): Promise<GlobalVersion> {
    const res = await app().request(`/globals/contact/versions/${String(version)}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: GlobalVersion }).data;
}

describe('GET /globals/:key/versions', () => {
    it('lists a version per replaced state, newest first', async () => {
        // The first save replaces nothing, so three writes leave two versions.
        await save('one@b.dev');
        await save('two@b.dev');
        await save('three@b.dev');

        const listed = await versions();
        expect(listed.map((version) => version.version)).toEqual([2, 1]);
        expect(listed.every((version) => !('snapshot' in version))).toBe(true);
        expect((await read(2)).snapshot.fields['email']).toBe('two@b.dev');
        expect((await read(1)).snapshot.fields['email']).toBe('one@b.dev');
    });

    it('returns an empty list for a global saved once', async () => {
        await save('one@b.dev');
        expect(await versions()).toEqual([]);
    });
});

describe('GET /globals/:key/versions/:version', () => {
    it('404s a number the locale has no version for', async () => {
        await save('one@b.dev');
        const res = await app().request('/globals/contact/versions/1');
        expect(res.status).toBe(404);
    });
});

describe('POST /globals/:key/versions/:version/restore', () => {
    it('rolls the fields back to the named version', async () => {
        await save('one@b.dev');
        await save('two@b.dev');
        const [first] = await versions();

        const res = await app().request(
            `/globals/contact/versions/${String(first?.version)}/restore`,
            json({})
        );
        expect(res.status).toBe(200);
        const global = ((await res.json()) as { data: Global }).data;
        expect(global.fields).toEqual({ email: 'one@b.dev' });
    });

    it('404s a version that does not exist', async () => {
        await save('one@b.dev');

        const res = await app().request('/globals/contact/versions/9/restore', json({}));
        expect(res.status).toBe(404);
    });
});

describe('a global with versioning off', () => {
    it.each([
        ['GET', '/globals/theme/versions'],
        ['GET', '/globals/theme/versions/1'],
        ['POST', '/globals/theme/versions/1/restore'],
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
