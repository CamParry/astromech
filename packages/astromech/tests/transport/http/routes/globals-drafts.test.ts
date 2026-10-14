/**
 * HTTP route round-trips for drafts on globals: PUT `:key` on a published
 * global saves a draft, GET `:key?draft=true` reads it, and DELETE
 * `:key/draft` discards it. The service policy is pinned in
 * tests/globals/drafts.test.ts; these tests own the wiring: status codes, the
 * query flag and the permissions each route demands.
 *
 * `legal` is public, so its plain read needs no grant; `notice` is
 * translatable, for the locale a route names.
 */

import type { AstromechConfig } from '@/types/index';
import { adminRole, roleWith } from '@tests/fixtures';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { app, configWithGlobals, put } from './globals-app';

const api = currentServices.globals;

function makeConfig(): AstromechConfig {
    const config = configWithGlobals();
    return {
        ...config,
        globals: [
            ...(config.globals ?? []),
            {
                key: 'notice',
                label: 'Notice',
                translatable: true,
                fields: [{ name: 'text', type: 'text', label: 'Text' }],
            },
        ],
    };
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeConfig());
    await seedTestUser(db);
});

async function publishedLegal() {
    return api.update({
        key: 'legal',
        data: { fields: { terms: 'Live' }, status: 'published' },
    });
}

type GlobalBody = {
    data: { fields: { terms?: string; text?: string }; hasDraft: boolean };
};

describe('draft routes — round-trip', () => {
    it('saves a draft through PUT, reads it with ?draft=true, and discards it', async () => {
        const admin = app(adminRole);
        await publishedLegal();

        const saved = await admin.request(
            '/globals/legal',
            put({ fields: { terms: 'Changed' } })
        );
        expect(saved.status).toBe(200);
        expect(((await saved.json()) as GlobalBody).data).toMatchObject({
            fields: { terms: 'Changed' },
            hasDraft: true,
        });

        const live = await app(roleWith([])).request('/globals/legal');
        expect(((await live.json()) as GlobalBody).data).toMatchObject({
            fields: { terms: 'Live' },
            hasDraft: true,
        });

        const draft = await admin.request('/globals/legal?draft=true');
        expect(((await draft.json()) as GlobalBody).data.fields.terms).toBe('Changed');

        const discarded = await admin.request('/globals/legal/draft', {
            method: 'DELETE',
        });
        expect(discarded.status).toBe(200);
        expect(((await discarded.json()) as GlobalBody).data).toMatchObject({
            fields: { terms: 'Live' },
            hasDraft: false,
        });

        const again = await admin.request('/globals/legal/draft', { method: 'DELETE' });
        expect(again.status).toBe(404);
    });

    it('discards the draft of the locale the query names', async () => {
        const admin = app(adminRole);
        await api.update({
            key: 'notice',
            data: { fields: { text: 'En' }, status: 'published' },
        });
        await api.update({
            key: 'notice',
            locale: 'de',
            data: { fields: { text: 'De' }, status: 'published' },
        });
        await api.update({
            key: 'notice',
            locale: 'de',
            data: { fields: { text: 'De2' } },
        });

        const english = await admin.request('/globals/notice/draft', {
            method: 'DELETE',
        });
        expect(english.status).toBe(404);

        const german = await admin.request('/globals/notice/draft?locale=de', {
            method: 'DELETE',
        });
        expect(german.status).toBe(200);
        expect(((await german.json()) as GlobalBody).data.fields.text).toBe('De');
    });
});

describe('draft routes — permissions', () => {
    it('needs update to discard a draft', async () => {
        await publishedLegal();
        await api.update({ key: 'legal', data: { fields: { terms: 'Changed' } } });

        const reader = app(roleWith(['global:legal:read']));
        const refused = await reader.request('/globals/legal/draft', {
            method: 'DELETE',
        });
        expect(refused.status).toBe(403);

        const editor = app(roleWith(['global:legal:read', 'global:legal:update']));
        const allowed = await editor.request('/globals/legal/draft', {
            method: 'DELETE',
        });
        expect(allowed.status).toBe(200);
    });

    it('needs read to read a draft, even of a public global', async () => {
        await publishedLegal();
        await api.update({ key: 'legal', data: { fields: { terms: 'Changed' } } });

        const anyone = app(roleWith([]));
        expect((await anyone.request('/globals/legal?draft=true')).status).toBe(403);

        const reader = app(roleWith(['global:legal:read']));
        const read = await reader.request('/globals/legal?draft=true');
        expect(read.status).toBe(200);
        expect(((await read.json()) as GlobalBody).data.fields.terms).toBe('Changed');
    });
});
