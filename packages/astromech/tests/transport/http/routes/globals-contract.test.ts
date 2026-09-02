/**
 * The globals route table against the contract it is served from: every method
 * `GlobalsService` declares has a row, every row names a method the contract
 * describes, and every row is in the emitted document at the path it states.
 *
 * `globals-mounted.test.ts` owns whether a row reaches a handler; this owns
 * whether the table and the contract agree in the first place.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { globalsContract } from '@/globals/contract';
import { globalsService } from '@/globals/service';
import { createGlobalsRouter } from '@/transport/http/routes/globals';
import {
    GLOBALS_ROUTE_SPECS,
    HTTP_ROUTES,
} from '@/transport/http/routes/http-routes.shared';
import { configWithGlobals } from './globals-app';

type Document = { paths: Record<string, Record<string, unknown>> };

/** The method half of a route id — `globals.update` → `update`. */
function methodName(id: string): string {
    return id.slice(id.indexOf('.') + 1);
}

/** `/:key/staged` as OpenAPI spells it, under the mount path. */
function documentPath(path: string): string {
    return `/globals${path}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithGlobals());
});

describe('the route table', () => {
    it('names a method the contract describes on every row', () => {
        for (const spec of GLOBALS_ROUTE_SPECS) {
            expect(spec.id.startsWith('globals.'), spec.id).toBe(true);
            expect(Object.keys(globalsContract), spec.id).toContain(methodName(spec.id));
        }
    });

    it('carries a row for every GlobalsService method', () => {
        const served = new Set(GLOBALS_ROUTE_SPECS.map((spec) => methodName(spec.id)));
        expect([...served].sort()).toEqual(Object.keys(globalsService).sort());
    });

    it('mounts every row under /globals', () => {
        const mounted = HTTP_ROUTES.filter((route) => route.id.startsWith('globals.'));
        expect(mounted).toHaveLength(GLOBALS_ROUTE_SPECS.length);
        expect(mounted.every((route) => route.base === '/globals')).toBe(true);
    });

    it('documents every row, bespoke handlers included', () => {
        const app = new OpenAPIHono<{ Variables: AuthVariables }>();
        app.route('/globals', createGlobalsRouter());
        const doc = app.getOpenAPIDocument({
            openapi: '3.0.0',
            info: { title: 'Astromech CMS API', version: '1.0.0' },
        }) as unknown as Document;

        for (const spec of GLOBALS_ROUTE_SPECS) {
            const key = documentPath(spec.path);
            expect(Object.keys(doc.paths[key] ?? {}), key).toContain(spec.verb);
        }
    });
});
