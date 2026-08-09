/**
 * `/openapi.json` is emitted from the route table, so every row has to appear in
 * it — including the rows whose server handler is written by hand. A bespoke
 * handler is still public API: `POST /entries/{type}`, `PUT /entries/{type}/{id}`
 * and `DELETE /entries/{type}/{id}` are three of the most-used routes in the API
 * and were documented before they were hand-written.
 *
 * This is the check that a row and its document entry cannot drift: adding a row
 * with no document entry, or renaming a path in only one of the two places,
 * fails here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { createEntriesRouter, ENTRIES_ROUTES } from '@/transport/http/routes/entries';
import { mediaRouter, MEDIA_ROUTES } from '@/transport/http/routes/media';
import {
    notificationsRouter,
    NOTIFICATIONS_ROUTES,
} from '@/transport/http/routes/notifications';
import { settingsRouter, SETTINGS_ROUTES } from '@/transport/http/routes/settings';
import { usersRouter, USERS_ROUTES } from '@/transport/http/routes/users';
import type { RestRoute } from '@/transport/http/routes/rest-route';
import { HTTP_ROUTES, type MountedRoute } from '@/types/http-routes.shared';

type Operation = {
    summary?: string;
    requestBody?: {
        content: {
            'application/json': { schema: { properties?: Record<string, unknown> } };
        };
    };
};

type Document = {
    paths: Record<string, Record<string, Operation>>;
};

/** Every mounted table, against the base path its router serves from. */
function tables(): [string, RestRoute[]][] {
    return [
        ['/entries', ENTRIES_ROUTES],
        ['/users', USERS_ROUTES],
        ['/media', MEDIA_ROUTES],
        ['/settings', SETTINGS_ROUTES],
        ['/notifications', NOTIFICATIONS_ROUTES],
    ];
}

/** The rows whose handler is hand-written — documented, not mounted generically. */
function bespokeRoutes(): MountedRoute[] {
    return HTTP_ROUTES.filter((route) => route.handler === 'bespoke');
}

/** The JSON request body an operation documents, by property name. */
function bodyProperties(operation: Operation | undefined): string[] {
    const schema = operation?.requestBody?.content['application/json'].schema;
    return Object.keys(schema?.properties ?? {});
}

/** The document the five domain routers compose to. */
function document(): Document {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.route('/entries', createEntriesRouter());
    app.route('/users', usersRouter);
    app.route('/media', mediaRouter);
    app.route('/settings', settingsRouter);
    app.route('/notifications', notificationsRouter);
    return app.getOpenAPIDocument({
        openapi: '3.0.0',
        info: { title: 'Astromech CMS API', version: '1.0.0' },
    }) as unknown as Document;
}

/** `/entries` + `/:type/:id` as OpenAPI spells it. */
function documentPath(base: string, path: string): string {
    const merged = path === '/' ? base : `${base}${path}`;
    return merged.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('the emitted document', () => {
    it('carries every route in every table', () => {
        const paths = document().paths;
        for (const [base, routes] of tables()) {
            for (const route of routes) {
                const key = documentPath(base, route.path);
                expect(Object.keys(paths[key] ?? {}), key).toContain(route.verb);
            }
        }
    });

    it('describes each operation with the method contract’s own summary', () => {
        const paths = document().paths;
        expect(paths['/entries/{type}']?.['get']?.summary).toBe('List "{type}" entries.');
        expect(paths['/media/{id}']?.['delete']?.summary).toBe('Delete a media item.');
    });

    it('covers more than the five paths the hand-written routes described', () => {
        const total = tables().reduce((sum, [, routes]) => sum + routes.length, 0);
        expect(total).toBe(35);
        expect(Object.keys(document().paths).length).toBeGreaterThan(5);
    });

    it('carries the three entry routes whose handlers are bespoke', () => {
        const paths = document().paths;
        expect(Object.keys(paths['/entries/{type}'] ?? {})).toContain('post');
        expect(Object.keys(paths['/entries/{type}/{id}'] ?? {})).toContain('put');
        expect(Object.keys(paths['/entries/{type}/{id}'] ?? {})).toContain('delete');
    });

    it('carries every other bespoke row too', () => {
        const paths = document().paths;
        for (const route of bespokeRoutes()) {
            const key = documentPath(route.base, route.path);
            expect(Object.keys(paths[key] ?? {}), key).toContain(route.verb);
        }
    });

    it('describes a bespoke route from its own method contract', () => {
        const paths = document().paths;
        expect(paths['/entries/{type}']?.['post']?.summary).toBe(
            'Create a "{type}" entry.'
        );
        // The path already carries `type`, so the body is the rest of the input.
        expect(bodyProperties(paths['/entries/{type}']?.['post'])).toContain('title');
        expect(bodyProperties(paths['/entries/{type}']?.['post'])).not.toContain('type');
    });

    it('names the bulk request body `ids`, as the wire does', () => {
        const paths = document().paths;
        for (const path of [
            '/entries/{type}/bulk-trash',
            '/entries/{type}/bulk-delete',
            '/entries/{type}/bulk-restore',
            '/entries/{type}/bulk-publish',
            '/entries/{type}/bulk-unpublish',
            '/entries/{type}/bulk-schedule',
            '/entries/{type}/bulk-update',
        ]) {
            const properties = bodyProperties(paths[path]?.['post']);
            expect(properties, path).toContain('ids');
            expect(properties, path).not.toContain('id');
        }
    });
});
