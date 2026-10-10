/**
 * The seven `bulk-*` routes on `routes/entries.ts`.
 *
 * Each has its own body schema and its own capability gate, and three of them
 * answer `{ data }` while two answer `{ success: true }` — the envelope is not
 * uniform across them, so it is asserted per route.
 */

import type { AstromechConfig, Entry } from '@/types/index';
import { adminRole } from '@tests/fixtures';
import {
    createTestDb,
    getEntryType,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { mountRouter, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { defineHook } from '@/plugins/define-hook';
import { onError } from '@/transport/http/middleware/errors';
import { createEntriesRouter } from '@/transport/http/routes/entries';

const api = currentServices.entries;

function app() {
    const mounted = mountRouter('/entries', createEntriesRouter(), adminRole);
    // A write that throws is answered by the app-level handler, not the route,
    // so the status of a failed batch is only visible with it mounted.
    mounted.onError(onError);
    return mounted;
}

function post(path: string, body: unknown): Promise<Response> | Response {
    return app().request(`/entries${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** `makeTestConfig` with trash switched off for `note`. */
function configWithoutTrash(): AstromechConfig {
    const config = makeTestConfig();
    getEntryType(config, 'note').trash = false;
    return config;
}

/** `makeTestConfig` with a `post` field the field pipeline can reject. */
function configWithValidatedContact(): AstromechConfig {
    const config = makeTestConfig();
    const post = getEntryType(config, 'post');
    if (Array.isArray(post.fields)) {
        post.fields = [
            ...post.fields,
            {
                name: 'contact',
                type: 'text',
                label: 'Contact',
                validation: [{ email: true }],
            },
        ];
    }
    return config;
}

let ids: string[];

beforeEach(async () => {
    const db = await createTestDb();
    await seedTestUser(db);
    setupTestConfig(makeTestConfig());
    const first = await api.create({ type: 'post', data: { title: 'One', slug: 'one' } });
    const second = await api.create({
        type: 'post',
        data: { title: 'Two', slug: 'two' },
    });
    ids = [first.id, second.id];
});

describe('POST /entries/:type/bulk-update', () => {
    it('updates every id and returns { data: entries }', async () => {
        const res = await post('/post/bulk-update', {
            ids,
            data: { fields: { body: 'bulk' } },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data).toHaveLength(2);
        expect(body.data.every((e) => e.fields?.['body'] === 'bulk')).toBe(true);
    });

    it('422s an empty ids array', async () => {
        const res = await post('/post/bulk-update', { ids: [], data: {} });
        expect(res.status).toBe(422);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'VALIDATION_FAILED'
        );
    });

    it('422s a missing data key', async () => {
        const res = await post('/post/bulk-update', { ids });
        expect(res.status).toBe(422);
    });

    it('422s data that fails field validation, naming the failed id', async () => {
        setupTestConfig(configWithValidatedContact());

        const res = await post('/post/bulk-update', {
            ids,
            data: { title: 'Renamed', fields: { contact: 'not-an-email' } },
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: {
                code: string;
                details: {
                    failedId: string;
                    succeededBefore: string[];
                    fields: Record<string, string[]>;
                };
            };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details.failedId).toBe(ids[0]);
        expect(body.error.details.succeededBefore).toEqual([]);
        expect(body.error.details.fields).toEqual({
            contact: ['Must be a valid email address'],
        });

        const after = await api.query({ type: 'post', full: true });
        expect(after.data.map((entry) => entry.title).sort()).toEqual(['One', 'Two']);
        expect(after.data.every((entry) => entry.fields?.['contact'] === undefined)).toBe(
            true
        );
    });

    it('409s when an id is trashed between the read and the write, naming it', async () => {
        setupTestConfig(makeTestConfig());
        const second = ids[1] ?? '';
        let trashed = false;
        registerTestPlugins([
            {
                package: '@test/probe',
                hooks: [
                    defineHook('entry:beforeUpdate', async () => {
                        if (trashed) return;
                        trashed = true;
                        await api.trash({ type: 'post', id: second });
                    }),
                ],
            },
        ]);

        const res = await post('/post/bulk-update', { ids, data: { title: 'Renamed' } });

        expect(res.status).toBe(409);
        const body = (await res.json()) as {
            error: {
                code: string;
                details: { failedId: string; succeededBefore: string[]; reason: string };
            };
        };
        expect(body.error.code).toBe('CONFLICT');
        expect(body.error.details).toMatchObject({
            failedId: second,
            succeededBefore: [ids[0]],
            reason: 'trashed',
            id: second,
        });
        const live = await api.query({ type: 'post', full: true });
        expect(live.data.map((entry) => entry.title)).toEqual(['One']);
        const inTrash = await api.query({ type: 'post', full: true, trashed: true });
        expect(inTrash.data.map((entry) => entry.title)).toEqual(['Two']);
    });

    it('409s an id already in the trash before any write, naming it', async () => {
        const second = ids[1] ?? '';
        await api.trash({ type: 'post', id: second });

        const res = await post('/post/bulk-update', { ids, data: { title: 'Renamed' } });

        expect(res.status).toBe(409);
        const body = (await res.json()) as {
            error: { code: string; details: Record<string, unknown> };
        };
        expect(body.error.code).toBe('CONFLICT');
        expect(body.error.details).toEqual({
            reason: 'trashed',
            id: second,
            locale: 'en',
        });
        const live = await api.query({ type: 'post', full: true });
        expect(live.data.map((entry) => entry.title)).toEqual(['One']);
    });

    it('409s a status change on a type without the statuses capability', async () => {
        const snippet = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k' } },
        });
        const res = await post('/snippet/bulk-update', {
            ids: [snippet.id],
            data: { status: 'published' },
        });
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'capability_not_supported'
        );
    });
});

describe('POST /entries/:type/bulk-trash', () => {
    it('trashes every id and returns { success: true }', async () => {
        const res = await post('/post/bulk-trash', { ids });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });

        const trashed = await api.query({ type: 'post', trashed: true, full: true });
        expect(trashed.data).toHaveLength(2);
    });

    it('409s when the type has no trash capability', async () => {
        setupTestConfig(configWithoutTrash());
        const note = await api.create({ type: 'note', data: { title: 'N', slug: 'n' } });
        const res = await post('/note/bulk-trash', { ids: [note.id] });
        expect(res.status).toBe(409);
    });

    it('422s an empty ids array', async () => {
        const res = await post('/post/bulk-trash', { ids: [] });
        expect(res.status).toBe(422);
    });

    it('reports the failure under `ids`, the name the caller sent', async () => {
        // The method's argument is `id`; the wire has always called it `ids`,
        // and an error that names the argument names a field the caller has not
        // heard of.
        const res = await post('/post/bulk-trash', { ids: [] });
        const body = (await res.json()) as {
            error: { details: { fields: Record<string, string[]> } };
        };
        expect(Object.keys(body.error.details.fields)).toEqual(['ids']);
    });
});

describe('POST /entries/:type/bulk-delete', () => {
    it('hard-deletes every id and returns { success: true }', async () => {
        const res = await post('/post/bulk-delete', { ids });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect((await api.query({ type: 'post', full: true })).data).toEqual([]);
    });

    it('422s an empty ids array', async () => {
        const res = await post('/post/bulk-delete', { ids: [] });
        expect(res.status).toBe(422);
    });
});

describe('POST /entries/:type/bulk-restore', () => {
    it('restores every id and returns { data: entries }', async () => {
        await api.trash({ type: 'post', ids });

        const res = await post('/post/bulk-restore', { ids });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data).toHaveLength(2);
        expect(
            (await api.query({ type: 'post', trashed: true, full: true })).data
        ).toEqual([]);
    });

    it('409s when the type has no trash capability', async () => {
        setupTestConfig(configWithoutTrash());
        const note = await api.create({ type: 'note', data: { title: 'N', slug: 'n2' } });
        const res = await post('/note/bulk-restore', { ids: [note.id] });
        expect(res.status).toBe(409);
    });
});

describe('POST /entries/:type/bulk-publish', () => {
    it('publishes every id and returns { data: entries }', async () => {
        const res = await post('/post/bulk-publish', { ids });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.map((e) => e.status)).toEqual(['published', 'published']);
    });

    it('409s when the type has no statuses capability', async () => {
        const snippet = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k' } },
        });
        const res = await post('/snippet/bulk-publish', { ids: [snippet.id] });
        expect(res.status).toBe(409);
    });
});

describe('POST /entries/:type/bulk-unpublish', () => {
    it('unpublishes every id and returns { data: entries }', async () => {
        await api.publish({ type: 'post', ids });

        const res = await post('/post/bulk-unpublish', { ids });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(body.data.map((e) => e.status)).toEqual(['unpublished', 'unpublished']);
    });

    it('409s when the type has no statuses capability', async () => {
        const snippet = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k' } },
        });
        const res = await post('/snippet/bulk-unpublish', { ids: [snippet.id] });
        expect(res.status).toBe(409);
    });
});

describe('POST /entries/:type/bulk-schedule', () => {
    const publishedAt = '2999-01-01T00:00:00.000Z';

    it('schedules every id and returns { data: entries }', async () => {
        const res = await post('/post/bulk-schedule', { ids, publishedAt });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.map((e) => e.status)).toEqual(['scheduled', 'scheduled']);
    });

    it('422s a publishedAt that is not an offset datetime', async () => {
        const res = await post('/post/bulk-schedule', { ids, publishedAt: 'tomorrow' });
        expect(res.status).toBe(422);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'VALIDATION_FAILED'
        );
    });

    it('409s when the type has no statuses capability', async () => {
        const snippet = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k' } },
        });
        const res = await post('/snippet/bulk-schedule', {
            ids: [snippet.id],
            publishedAt,
        });
        expect(res.status).toBe(409);
    });
});
