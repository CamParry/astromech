/**
 * The publish/schedule, version-history and relationship routes on
 * `routes/entries.ts` — the ten single-entry handlers left over once CRUD, the
 * bulk routes and staging are accounted for.
 *
 * `versions` and `restoreVersion` declare `requires: 'versioning'` in their
 * contract, so an unversioned type answers the capability 409 both are pinned
 * on here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter } from '@tests/mount-router';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';
import type { Entry, EntryVersion, IncomingRelationship } from '@/types/index';

function app() {
    return mountRouter('/entries', createEntriesRouter(), adminRole);
}

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    const created = await api.create({
        type: 'post',
        title: 'Subject',
        slug: 'subject',
        fields: { body: 'v1' },
    });
    id = created.id;
});

describe('POST /entries/:type/:id/publish', () => {
    it('publishes and returns { data: entry }', async () => {
        const res = await app().request(`/entries/post/${id}/publish`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(id);
        expect(body.data.status).toBe('published');
        expect(body.data.publishedAt).not.toBeNull();
    });

    it('409s a type without the statuses capability', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const res = await app().request(`/entries/snippet/${snippet.id}/publish`, {
            method: 'POST',
        });
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'capability_not_supported'
        );
    });
});

describe('POST /entries/:type/:id/unpublish', () => {
    it('unpublishes and returns { data: entry }', async () => {
        await api.publish({ type: 'post', id });
        const res = await app().request(`/entries/post/${id}/unpublish`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.status).toBe('unpublished');
    });

    it('409s a type without the statuses capability', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const res = await app().request(`/entries/snippet/${snippet.id}/unpublish`, {
            method: 'POST',
        });
        expect(res.status).toBe(409);
    });
});

describe('POST /entries/:type/:id/schedule', () => {
    it('schedules and returns { data: entry }', async () => {
        const res = await app().request(`/entries/post/${id}/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publishedAt: '2999-01-01T00:00:00.000Z' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.status).toBe('scheduled');
    });

    it('422s a publishedAt that is not an offset datetime', async () => {
        const res = await app().request(`/entries/post/${id}/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publishedAt: 'soon' }),
        });
        expect(res.status).toBe(422);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'VALIDATION_FAILED'
        );
    });

    it('409s a type without the statuses capability', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const res = await app().request(`/entries/snippet/${snippet.id}/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publishedAt: '2999-01-01T00:00:00.000Z' }),
        });
        expect(res.status).toBe(409);
    });
});

describe('GET /entries/:type/:id/versions', () => {
    it('returns { data: versions } newest first', async () => {
        await api.update({ type: 'post', id, data: { fields: { body: 'v2' } } });

        const res = await app().request(`/entries/post/${id}/versions`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: EntryVersion[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.length).toBeGreaterThan(0);
        expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
            'createdAt',
            'createdBy',
            'entryId',
            'fields',
            'id',
            'slug',
            'status',
            'title',
            'versionNumber',
        ]);
    });

    it('409s an unversioned type on the capability its contract requires', async () => {
        const note = await api.create({ type: 'note', title: 'N', slug: 'n' });
        const res = await app().request(`/entries/note/${note.id}/versions`);
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('capability_not_supported');
    });
});

describe('POST /entries/:type/:id/versions/:versionId/restore', () => {
    it('rolls the entry back and returns { data: entry }', async () => {
        await api.update({ type: 'post', id, data: { fields: { body: 'v2' } } });
        const [version] = await api.versions({ type: 'post', id });

        const res = await app().request(
            `/entries/post/${id}/versions/${version?.id}/restore`,
            { method: 'POST' }
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(id);
    });

    it('409s an unversioned type on the capability its contract requires', async () => {
        const note = await api.create({ type: 'note', title: 'N2', slug: 'n2' });
        const res = await app().request(`/entries/note/${note.id}/versions/v1/restore`, {
            method: 'POST',
        });
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('capability_not_supported');
    });

    it('404s an unknown type before the version is looked up', async () => {
        const res = await app().request('/entries/nope/x/versions/y/restore', {
            method: 'POST',
        });
        expect(res.status).toBe(404);
    });
});

describe('GET /entries/:type/:id/incoming-relationships', () => {
    it('returns { data: relationships } naming the source entry and field path', async () => {
        const source = await api.create({
            type: 'post',
            title: 'Source',
            slug: 'source',
            fields: { related: [id] },
        });

        const res = await app().request(`/entries/post/${id}/incoming-relationships`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: IncomingRelationship[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toEqual({
            sourceId: source.id,
            sourceTitle: 'Source',
            sourceType: 'post',
            schemaPath: 'related',
        });
    });

    it('returns an empty list when nothing points at the entry', async () => {
        const res = await app().request(`/entries/post/${id}/incoming-relationships`);
        expect(((await res.json()) as { data: unknown[] }).data).toEqual([]);
    });
});
