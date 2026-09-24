/**
 * The generic handler behind the REST route table — the two facts that belong to
 * the machinery rather than to any one route.
 *
 * `PUT /media/:id` is the probe: its method takes `{ id, data }`, so it is the
 * converted route where the argument shape could leak into the response.
 */

import type { HttpRouteSpec } from '@/transport/http/routes/http-routes';
import type { Role, ServiceMethodContract } from '@/types/index';
import type { RouteEnv } from '@tests/mount-router';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { noopStorage, roleWith } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';
import { mountRestRoutes } from '@/transport/http/routes/rest-route';

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await getMediaRepository().create(
        {
            filename: 'a.png',
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    id = row.id;
});

/** `PUT /media/:id` with a raw body string, under `role`. */
function put(role: Role, body: string): Promise<Response> | Response {
    return mountRouter('/media', mediaRouter, role).request(`/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

const allowed = roleWith(['media:update']);
const denied = roleWith([]);

describe('validation-error field paths', () => {
    it('reports the field the caller sent, not the argument key it lands under', async () => {
        const res = await put(allowed, JSON.stringify({ alt: 42 }));
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { details: { fields: Record<string, string[]> } };
        };
        expect(Object.keys(body.error.details.fields)).toEqual(['alt']);
    });
});

describe('permission is answered before the body is read', () => {
    it('403s an unauthorized request whose body would also fail validation', async () => {
        const res = await put(denied, JSON.stringify({ alt: 42 }));
        expect(res.status).toBe(403);
    });

    it('403s an unauthorized request whose body is not JSON at all', async () => {
        const res = await put(denied, 'not json');
        expect(res.status).toBe(403);
    });

    it('400s an authorized request whose body is not JSON', async () => {
        const res = await put(allowed, 'not json');
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
    });
});

/** A one-method catalogue whose only method demands `media:update`. */
const catalogue: Record<string, ServiceMethodContract> = {
    present: { access: 'media:update', input: z.object({}), mutates: false },
};

/** `GET /probe/x`, naming `probe.present` or the method `id` names. */
function probeRow(id = 'probe.present'): HttpRouteSpec {
    return { verb: 'get', path: '/x', id };
}

describe('mountRestRoutes', () => {
    it('throws at mount when a route names a method the catalogue lacks', () => {
        expect(() =>
            mountRestRoutes(new OpenAPIHono(), {
                catalogue,
                specs: [probeRow('probe.missing')],
            })
        ).toThrow("names 'probe.missing', which this catalogue does not describe");
    });

    it('403s a role the method’s access refuses, before anything else', async () => {
        const router = new OpenAPIHono<RouteEnv>();
        mountRestRoutes(router, { catalogue, specs: [probeRow()] });
        const res = await mountRouter('/probe', router, denied).request('/probe/x');
        expect(res.status).toBe(403);
    });
});

/** `GET /media` with `query`, under a role that may read media. */
function list(query: string): Promise<Response> | Response {
    return mountRouter('/media', mediaRouter, roleWith(['media:read'])).request(
        `/media?${query}`
    );
}

describe('arguments from the query string', () => {
    it('converts a value the method types as a number', async () => {
        const res = await list('limit=1&page=1');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { pagination: { limit: number } };
        expect(body.pagination.limit).toBe(1);
    });

    it('passes a value it cannot convert on, for the method to refuse', async () => {
        const res = await list('limit=lots');
        expect(res.status).toBe(422);
    });

    it('reads `sort` and `dir` as one sort, and `where[field]` as a filter', async () => {
        const res = await list('sort=filename&dir=asc&where[mimeType]=images');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { id: string }[] };
        expect(body.data.map((row) => row.id)).toEqual([id]);

        const none = await list('where[mimeType]=documents');
        const empty = (await none.json()) as { data: unknown[] };
        expect(empty.data).toEqual([]);
    });
});
