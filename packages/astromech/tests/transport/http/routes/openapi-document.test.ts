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

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { MountedRoute } from '@/transport/http/routes/http-routes.shared';
import type { RestRoute } from '@/transport/http/routes/rest-route';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEntriesRouter, ENTRIES_ROUTES } from '@/transport/http/routes/entries';
import { HTTP_ROUTES } from '@/transport/http/routes/http-routes.shared';
import { MEDIA_ROUTES, mediaRouter } from '@/transport/http/routes/media';
import {
    NOTIFICATIONS_ROUTES,
    notificationsRouter,
} from '@/transport/http/routes/notifications';
import { SETTINGS_ROUTES, settingsRouter } from '@/transport/http/routes/settings';
import { USERS_ROUTES, usersRouter } from '@/transport/http/routes/users';

type Schema = { properties?: Record<string, unknown>; $ref?: string };

type Operation = {
    summary?: string;
    parameters?: { name: string; in: string }[];
    requestBody?: {
        content: { 'application/json': { schema: Schema } };
    };
};

type Document = {
    paths: Record<string, Record<string, Operation>>;
    components?: { schemas?: Record<string, Schema> };
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

/**
 * The JSON request body an operation documents, by property name. A `bodyKey`
 * route documents a named schema, so a `$ref` is followed to its component.
 */
function bodyProperties(operation: Operation | undefined, doc: Document): string[] {
    const schema = operation?.requestBody?.content['application/json'].schema;
    const resolved =
        schema?.$ref === undefined
            ? schema
            : doc.components?.schemas?.[schema.$ref.replace('#/components/schemas/', '')];
    return Object.keys(resolved?.properties ?? {});
}

/** The query parameters an operation documents, by name. */
function queryParameters(operation: Operation | undefined): string[] {
    return (operation?.parameters ?? [])
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => parameter.name);
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
        const doc = document();
        const post = doc.paths['/entries/{type}']?.['post'];
        expect(post?.summary).toBe('Create a "{type}" entry.');
        // `type` is in the path, so the body is the method's `data` alone — the
        // flat payload the wire has always sent.
        expect(bodyProperties(post, doc)).toContain('title');
        expect(bodyProperties(post, doc)).not.toContain('type');
        expect(bodyProperties(post, doc)).not.toContain('data');
    });

    it('documents `locale` as a query param on the content-level routes', () => {
        const doc = document();
        const paths = doc.paths;
        expect(queryParameters(paths['/entries/{type}/{id}/publish']?.['post'])).toEqual([
            'locale',
        ]);
        expect(queryParameters(paths['/entries/{type}/{id}/versions']?.['get'])).toEqual([
            'locale',
        ]);
        expect(
            queryParameters(paths['/entries/{type}/{id}/staged/merge']?.['post'])
        ).toEqual(['locale']);
        expect(queryParameters(paths['/entries/{type}/{id}']?.['put']).sort()).toEqual([
            'locale',
            'staged',
        ]);
    });

    it('keeps a query-param argument out of the request body', () => {
        const doc = document();
        // `schedule` takes `publishedAt` in the body and `locale` on the URL.
        const schedule = doc.paths['/entries/{type}/{id}/schedule']?.['post'];
        expect(bodyProperties(schedule, doc)).toEqual(['publishedAt']);
        expect(queryParameters(schedule)).toEqual(['locale']);
    });

    it('names the bulk request body `ids`, as the wire does', () => {
        const doc = document();
        const paths = doc.paths;
        for (const path of [
            '/entries/{type}/bulk-trash',
            '/entries/{type}/bulk-delete',
            '/entries/{type}/bulk-restore',
            '/entries/{type}/bulk-publish',
            '/entries/{type}/bulk-unpublish',
            '/entries/{type}/bulk-schedule',
            '/entries/{type}/bulk-update',
        ]) {
            const properties = bodyProperties(paths[path]?.['post'], doc);
            expect(properties, path).toContain('ids');
            expect(properties, path).not.toContain('id');
        }
    });
});
