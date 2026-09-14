/**
 * The generic handler behind the REST route table — the two facts that belong to
 * the machinery rather than to any one route.
 *
 * `PUT /media/:id` is the probe: its method takes `{ id, data }`, so it is the
 * converted route where the argument shape could leak into the response.
 */

import type { RestRoute } from '@/transport/http/routes/rest-route';
import type { Role, ServiceMethodContract, StorageDriver } from '@/types/index';
import type { RouteEnv } from '@tests/mount-router';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, roleWith } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';
import { mountRestRoutes } from '@/transport/http/routes/rest-route';

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
    const row = await createMediaRepository().create(
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

/**
 * `GET /probe/x` naming `probe.present`. Its args throw a `SyntaxError`, which
 * the mount answers 400, so a 400 means the route got as far as reading args.
 */
function probeRoute(precondition?: RestRoute['precondition']): RestRoute {
    return {
        verb: 'get',
        path: '/x',
        id: 'probe.present',
        args: () => {
            throw new SyntaxError('reached args');
        },
        ...(precondition !== undefined ? { precondition } : {}),
    };
}

/** Mount `route` against {@link catalogue} and request it under `role`. */
function probe(route: RestRoute, role: Role): Promise<Response> | Response {
    const router = new OpenAPIHono<RouteEnv>();
    mountRestRoutes(router, catalogue, [route]);
    return mountRouter('/probe', router, role).request('/probe/x');
}

describe('mountRestRoutes', () => {
    it('throws at mount when a route names a method the catalogue lacks', () => {
        const route = { ...probeRoute(), id: 'probe.missing' };
        expect(() => mountRestRoutes(new OpenAPIHono(), catalogue, [route])).toThrow(
            "names 'probe.missing', which this catalogue does not describe"
        );
    });

    it('403s a role the catalogue refuses when the route has no precondition', async () => {
        const res = await probe(probeRoute(), denied);
        expect(res.status).toBe(403);
    });

    it('skips the catalogue check when the route declares a precondition', async () => {
        const res = await probe(
            probeRoute(() => null),
            denied
        );
        expect(res.status).toBe(400);
    });
});
