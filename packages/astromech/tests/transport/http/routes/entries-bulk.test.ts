/**
 * The seven `bulk-*` routes on `routes/entries.ts`.
 *
 * Each has its own body schema and its own capability gate, and three of them
 * answer `{ data }` while two answer `{ success: true }` — the envelope is not
 * uniform across them, so it is asserted per route.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter } from '@tests/mount-router';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';
import type { AstromechConfig, Entry } from '@/types/index';

function app() {
    return mountRouter('/entries', createEntriesRouter(), adminRole);
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
    if (config.entries['note']) config.entries['note'].trash = false;
    return config;
}

let ids: string[];

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    const first = await api.create({ type: 'post', title: 'One', slug: 'one' });
    const second = await api.create({ type: 'post', title: 'Two', slug: 'two' });
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

    it('409s a status change on a type without the statuses capability', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
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
        const note = await api.create({ type: 'note', title: 'N', slug: 'n' });
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
        await api.trash({ type: 'post', id: ids });

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
        const note = await api.create({ type: 'note', title: 'N', slug: 'n2' });
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
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const res = await post('/snippet/bulk-publish', { ids: [snippet.id] });
        expect(res.status).toBe(409);
    });
});

describe('POST /entries/:type/bulk-unpublish', () => {
    it('unpublishes every id and returns { data: entries }', async () => {
        await api.publish({ type: 'post', id: ids });

        const res = await post('/post/bulk-unpublish', { ids });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(body.data.map((e) => e.status)).toEqual(['unpublished', 'unpublished']);
    });

    it('409s when the type has no statuses capability', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
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
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const res = await post('/snippet/bulk-schedule', {
            ids: [snippet.id],
            publishedAt,
        });
        expect(res.status).toBe(409);
    });
});
