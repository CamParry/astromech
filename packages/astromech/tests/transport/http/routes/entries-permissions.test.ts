/**
 * The permission matrix of `routes/entries.ts`: which `entry:post:<action>` each
 * route demands, and what it answers to a role that lacks it.
 *
 * Enforcement moves to `scopedServices` later, so this is the record that the
 * move changed nothing — including the two things the scoped handle does not
 * derive: the publish escalation on an `update` carrying `status: 'published'`,
 * and the fact that the permission is checked BEFORE the entry type is
 * resolved on every route, the cross-type `POST /query` included.
 */

import type { EntryAction } from '@/permissions/entry-permission';
import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, roleWith } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';

const ACTIONS: EntryAction[] = ['read', 'create', 'update', 'delete', 'publish'];

/** A role holding every `entry:post:*` action EXCEPT `except`. */
function allBut(except: EntryAction) {
    return roleWith(ACTIONS.filter((a) => a !== except).map((a) => `entry:post:${a}`));
}

/** A role holding every `entry:post:*` action. */
function allActions() {
    return roleWith(ACTIONS.map((a) => `entry:post:${a}`));
}

function request(
    role: ReturnType<typeof roleWith>,
    path: string,
    init?: RequestInit
): Promise<Response> | Response {
    return mountRouter('/entries', createEntriesRouter(), role).request(
        `/entries${path}`,
        init
    );
}

function json(body: unknown): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

/** `makeTestConfig` with staging (and so versioning) on for `post`. */
function configWithStaging(): AstromechConfig {
    const config = makeTestConfig();
    if (config.entries['post']) config.entries['post'].staging = true;
    return config;
}

let id: string;
let versionId: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    const created = await api.create({
        type: 'post',
        data: { title: 'Subject', slug: 'subject', fields: { body: 'v1' } },
    });
    id = created.id;
    await api.update({ type: 'post', id, data: { fields: { body: 'v2' } } });
    versionId = (await api.versions({ type: 'post', id }))[0]?.id ?? '';
});

describe('every entries route demands one entry action', () => {
    /** [label, action demanded, path, request init]. */
    function cases(): [string, EntryAction, string, RequestInit | undefined][] {
        const publishedAt = '2999-01-01T00:00:00.000Z';
        return [
            ['GET /:type', 'read', '/post', undefined],
            ['GET /:type/:id', 'read', `/post/${id}`, undefined],
            ['POST /:type', 'create', '/post', json({ title: 'New', slug: 'new' })],
            ['POST /:type/query', 'read', '/post/query', json({})],
            [
                'POST /:type/bulk-update',
                'update',
                '/post/bulk-update',
                json({ ids: [id], data: { title: 'Bulk' } }),
            ],
            ['POST /:type/bulk-trash', 'delete', '/post/bulk-trash', json({ ids: [id] })],
            [
                'POST /:type/bulk-delete',
                'delete',
                '/post/bulk-delete',
                json({ ids: [id] }),
            ],
            [
                'POST /:type/bulk-restore',
                'update',
                '/post/bulk-restore',
                json({ ids: [id] }),
            ],
            [
                'POST /:type/bulk-publish',
                'publish',
                '/post/bulk-publish',
                json({ ids: [id] }),
            ],
            [
                'POST /:type/bulk-unpublish',
                'publish',
                '/post/bulk-unpublish',
                json({ ids: [id] }),
            ],
            [
                'POST /:type/bulk-schedule',
                'publish',
                '/post/bulk-schedule',
                json({ ids: [id], publishedAt }),
            ],
            ['POST /:type/:id/restore', 'update', `/post/${id}/restore`, json({})],
            ['POST /:type/:id/duplicate', 'create', `/post/${id}/duplicate`, json({})],
            [
                'PUT /:type/:id',
                'update',
                `/post/${id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'Renamed' }),
                },
            ],
            ['DELETE /:type/trash', 'delete', '/post/trash', { method: 'DELETE' }],
            [
                'DELETE /:type/:id/force',
                'delete',
                `/post/${id}/force`,
                { method: 'DELETE' },
            ],
            ['DELETE /:type/:id', 'delete', `/post/${id}`, { method: 'DELETE' }],
            ['POST /:type/:id/publish', 'publish', `/post/${id}/publish`, json({})],
            ['POST /:type/:id/unpublish', 'publish', `/post/${id}/unpublish`, json({})],
            [
                'POST /:type/:id/schedule',
                'publish',
                `/post/${id}/schedule`,
                json({ publishedAt }),
            ],
            ['GET /:type/:id/versions', 'read', `/post/${id}/versions`, undefined],
            [
                'POST /:type/:id/versions/:versionId/restore',
                'update',
                `/post/${id}/versions/${versionId}/restore`,
                json({}),
            ],
            [
                'GET /:type/:id/incoming-relationships',
                'read',
                `/post/${id}/incoming-relationships`,
                undefined,
            ],
        ];
    }

    it('403s each route for a role holding every other action', async () => {
        for (const [label, action, path, init] of cases()) {
            const res = await request(allBut(action), path, init);
            expect(`${label}: ${res.status}`).toBe(`${label}: 403`);
        }
    });

    it('admits each route for a role holding every action', async () => {
        for (const [label, , path, init] of cases()) {
            const res = await request(allActions(), path, init);
            expect(`${label}: ${res.status === 403}`).toBe(`${label}: false`);
        }
    });
});

describe('the publish escalation on update', () => {
    it('403s PUT with status: published when the role holds update but not publish', async () => {
        const res = await request(
            roleWith(['entry:post:read', 'entry:post:update']),
            `/post/${id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'published' }),
            }
        );
        expect(res.status).toBe(403);
    });

    it('admits the same PUT once the role holds publish', async () => {
        const res = await request(
            roleWith(['entry:post:read', 'entry:post:update', 'entry:post:publish']),
            `/post/${id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'published' }),
            }
        );
        expect(res.status).toBe(200);
    });

    it('403s bulk-update with status: published without publish', async () => {
        const res = await request(
            roleWith(['entry:post:update']),
            '/post/bulk-update',
            json({ ids: [id], data: { status: 'published' } })
        );
        expect(res.status).toBe(403);
    });
});

describe('entry:read:full on a root type', () => {
    it('403s ?full=true for a role holding only entry:post:read', async () => {
        const res = await request(roleWith(['entry:post:read']), '/post?full=true');
        expect(res.status).toBe(403);
    });

    it('admits ?full=true once the role holds entry:read:full', async () => {
        const res = await request(
            roleWith(['entry:post:read', 'entry:read:full']),
            '/post?full=true'
        );
        expect(res.status).toBe(200);
    });
});

describe('permission is checked before the type is resolved', () => {
    it('403s an unknown type for an under-privileged role, but 404s it for a privileged one', async () => {
        const denied = await request(roleWith([]), '/nope');
        expect(denied.status).toBe(403);

        const found = await request(roleWith(['*']), '/nope');
        expect(found.status).toBe(404);
    });

    it('holds on POST /query too: 403 for an under-privileged role, 404 for a privileged one', async () => {
        const denied = await request(roleWith([]), '/query', json({ type: 'nope' }));
        expect(denied.status).toBe(403);

        const found = await request(roleWith(['*']), '/query', json({ type: 'nope' }));
        expect(found.status).toBe(404);
    });
});

describe('POST /query — the cross-type route', () => {
    it('400s a body with no type', async () => {
        const res = await request(roleWith(['*']), '/query', json({}));
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('`type` is required (string or string[])');
    });

    it('400s a body with an empty type array', async () => {
        const res = await request(roleWith(['*']), '/query', json({ type: [] }));
        expect(res.status).toBe(400);
    });

    it('demands read on EVERY named type', async () => {
        const res = await request(
            roleWith(['entry:post:read']),
            '/query',
            json({ type: ['post', 'note'] })
        );
        expect(res.status).toBe(403);
    });

    it('accepts a single type as a bare string', async () => {
        // `full` because the subject entry is unpublished — the public shape
        // would answer with an empty list and prove nothing.
        const res = await request(
            roleWith(['*']),
            '/query',
            json({ type: 'post', full: true })
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { title: string }[] };
        expect(body.data.map((e) => e.title)).toEqual(['Subject']);
    });
});

describe('staged routes — permission matrix', () => {
    beforeEach(() => {
        setupTestConfig(configWithStaging());
    });

    it('403s createStaged, deleteStaged and the preview token without update', async () => {
        const role = allBut('update');
        expect((await request(role, `/post/${id}/staged`, json({}))).status).toBe(403);
        expect(
            (await request(role, `/post/${id}/staged`, { method: 'DELETE' })).status
        ).toBe(403);
        expect((await request(role, `/post/${id}/preview-token`, json({}))).status).toBe(
            403
        );
        expect(
            (await request(role, `/post/${id}/preview-token`, { method: 'DELETE' }))
                .status
        ).toBe(403);
    });

    it('403s getStaged without read', async () => {
        const res = await request(allBut('read'), `/post/${id}/staged`);
        expect(res.status).toBe(403);
    });

    it('403s mergeStaged without publish', async () => {
        const res = await request(
            allBut('publish'),
            `/post/${id}/staged/merge`,
            json({})
        );
        expect(res.status).toBe(403);
    });
});
