/**
 * `/openapi.json` is emitted from the route table, so every row has to appear in
 * it, including the rows whose server handler is written by hand.
 *
 * This is the check that a row and its document entry cannot drift: adding a row
 * with no document entry, or renaming a path in only one of the two places,
 * fails here.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEntriesRouter } from '@/transport/http/routes/entries';
import { createGlobalsRouter } from '@/transport/http/routes/globals';
import { HTTP_ROUTES } from '@/transport/http/routes/http-routes';
import { mediaRouter } from '@/transport/http/routes/media';
import { notificationsRouter } from '@/transport/http/routes/notifications';
import { usersRouter } from '@/transport/http/routes/users';

type Schema = {
    type?: string;
    format?: string;
    nullable?: boolean;
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    anyOf?: Schema[];
    allOf?: Schema[];
    additionalProperties?: boolean | Schema;
    $ref?: string;
};

type Operation = {
    summary?: string;
    parameters?: { name: string; in: string }[];
    requestBody?: {
        content: { 'application/json': { schema: Schema } };
    };
    responses: Record<string, { content?: { 'application/json': { schema: Schema } } }>;
};

type Document = {
    paths: Record<string, Record<string, Operation>>;
    components?: { schemas?: Record<string, Schema> };
};

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

/** The JSON body an operation documents for `status`, if any. */
function responseSchema(
    operation: Operation | undefined,
    status: number
): Schema | undefined {
    return operation?.responses[String(status)]?.content?.['application/json'].schema;
}

/** A named component of the document. */
function component(doc: Document, name: string): Schema {
    const schema = doc.components?.schemas?.[name];
    if (schema === undefined) throw new Error(`No component '${name}'`);
    return schema;
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
    app.route('/globals', createGlobalsRouter());
    app.route('/users', usersRouter);
    app.route('/media', mediaRouter);
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
    it('carries every row in the table, bespoke ones included', () => {
        const paths = document().paths;
        for (const route of HTTP_ROUTES) {
            const key = documentPath(route.base, route.path);
            expect(Object.keys(paths[key] ?? {}), key).toContain(route.verb);
        }
    });

    it('describes each operation with the method contract’s own summary', () => {
        const paths = document().paths;
        expect(paths['/entries/{type}']?.['get']?.summary).toBe('List "{type}" entries.');
        expect(paths['/media/{id}']?.['delete']?.summary).toBe('Delete a media item.');
    });

    it('describes a route from its own method contract', () => {
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

    it('documents a read’s query string from the method’s input', () => {
        // `full` and `staged` are the two shapes the global read accepts.
        const doc = document();
        const get = doc.paths['/globals/{key}']?.['get'];
        expect(queryParameters(get).sort()).toEqual(['full', 'locale', 'staged']);
        // The write takes both on the URL and the `data` key alone as its body.
        const write = doc.paths['/globals/{key}']?.['put'];
        expect(queryParameters(write).sort()).toEqual(['locale', 'staged']);
        expect(bodyProperties(write, doc)).toEqual(['fields', 'status', 'publishedAt']);
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

describe('the documented responses', () => {
    // Every core method declares an output, so every route but a 204 has a body.
    it('gives every route a response body from its method’s output', () => {
        const doc = document();
        for (const route of HTTP_ROUTES) {
            const key = documentPath(route.base, route.path);
            const operation = doc.paths[key]?.[route.verb];
            if (route.envelope === 'empty') {
                expect(operation?.responses['204'], key).toBeDefined();
                expect(responseSchema(operation, 204), key).toBeUndefined();
                continue;
            }
            expect(responseSchema(operation, route.status ?? 200), key).toBeDefined();
        }
    });

    it('wraps the output in the route’s envelope', () => {
        const doc = document();
        const get = doc.paths['/entries/{type}/{id}']?.['get'];
        expect(responseSchema(get, 200)?.properties?.['data']).toEqual({
            $ref: '#/components/schemas/Entry',
        });
        const list = responseSchema(doc.paths['/entries/{type}']?.['get'], 200);
        expect(list?.properties?.['data']?.items).toEqual({
            $ref: '#/components/schemas/Entry',
        });
        expect(list?.properties?.['pagination']?.nullable).toBe(true);
        const trash = doc.paths['/entries/{type}/{id}/trash']?.['post'];
        expect(Object.keys(responseSchema(trash, 200)?.properties ?? {})).toEqual([
            'success',
        ]);
    });

    it('documents a 404 with the error body on a route that answers one', () => {
        const doc = document();
        for (const path of ['/entries/{type}/{id}', '/globals/{key}', '/users/{id}']) {
            expect(responseSchema(doc.paths[path]?.['get'], 404), path).toEqual({
                $ref: '#/components/schemas/Error',
            });
        }
        expect(Object.keys(component(doc, 'Error').properties ?? {})).toEqual(['error']);
    });

    it('documents a read that answers null without making the component nullable', () => {
        const doc = document();
        const staged = doc.paths['/entries/{type}/{id}/staged']?.['get'];
        expect(responseSchema(staged, 200)?.properties?.['data']?.anyOf?.[0]).toEqual({
            $ref: '#/components/schemas/StagedEntry',
        });
        for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
            expect(schema.nullable, name).toBeUndefined();
        }
    });

    it('documents what the count route answers, not the method’s scalar', () => {
        const count = responseSchema(
            document().paths['/notifications/count']?.['get'],
            200
        );
        expect(count?.properties?.['data']?.properties?.['count']).toEqual({
            type: 'number',
        });
    });

    it('keeps the internal keys out of the public components', () => {
        const doc = document();
        const internal = [
            'contentId',
            'contentCreatedAt',
            'contentUpdatedAt',
            'accountUpdatedAt',
            'fileUpdatedAt',
            'resourceId',
        ];
        for (const name of ['Entry', 'Global', 'Media', 'User']) {
            const keys = Object.keys(component(doc, name).properties ?? {});
            expect(keys, name).toContain('id');
            for (const key of internal) expect(keys, name).not.toContain(key);
        }
    });

    it('documents a date as an ISO string', () => {
        const doc = document();
        const dateTime = { type: 'string', format: 'date-time' };
        const entry = component(doc, 'Entry').properties ?? {};
        expect(entry['createdAt']).toEqual(dateTime);
        expect(entry['updatedAt']).toEqual(dateTime);
        expect(entry['publishedAt']).toEqual({ ...dateTime, nullable: true });
        expect(component(doc, 'User').properties?.['createdAt']).toEqual(dateTime);
        expect(component(doc, 'Notification').properties?.['createdAt']).toEqual(
            dateTime
        );
    });

    it('documents `fields` as an open object', () => {
        const doc = document();
        const object = { type: 'object', additionalProperties: true };
        expect(component(doc, 'Entry').properties?.['fields']).toEqual(object);
        expect(component(doc, 'EntryVersion').properties?.['fields']).toEqual({
            ...object,
            nullable: true,
        });
    });

    it('lists a key with a fallback as required, and an optional one as optional', () => {
        const doc = document();
        expect(component(doc, 'Entry').required).toEqual(
            expect.arrayContaining(['slug', 'createdBy', 'publishedAt'])
        );
        const media = component(doc, 'Media');
        expect(media.required).toEqual(expect.arrayContaining(['width', 'metadata']));
        const metadata = media.properties?.['metadata'];
        expect(Object.keys(metadata?.properties ?? {})).toContain('version');
        expect(metadata?.required ?? []).toEqual([]);
    });

    it('documents a key with a fallback as its nullable inner type', () => {
        const doc = document();
        const entry = component(doc, 'Entry').properties ?? {};
        expect(entry['slug']).toEqual({ type: 'string', nullable: true });
        expect(component(doc, 'Media').properties?.['width']).toEqual({
            type: 'number',
            nullable: true,
        });
        expect(component(doc, 'EntryVersion').properties?.['status']).toEqual({
            type: 'string',
            enum: ['unpublished', 'published', 'scheduled'],
            nullable: true,
        });
    });
});
