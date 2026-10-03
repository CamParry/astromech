/**
 * `/openapi.json` is emitted from the route table, so every row has to appear in
 * it, including the rows whose server handler is written by hand.
 *
 * This is the check that a row and its document entry cannot drift: adding a row
 * with no document entry, or renaming a path in only one of the two places,
 * fails here.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { PluginDefinition } from '@/types/index';
import type { OpenApiDocument, OpenApiOperation, OpenApiSchema } from '@tests/openapi';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { beforeEach, describe, expect, it } from 'vitest';
import { entrySchema } from '@/entries/schema';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { noInput } from '@/services/define-service-method';
import { createEntriesRouter } from '@/transport/http/routes/entries';
import { createGlobalsRouter } from '@/transport/http/routes/globals';
import { HTTP_ROUTES } from '@/transport/http/routes/http-routes';
import { mediaRouter } from '@/transport/http/routes/media';
import { notificationsRouter } from '@/transport/http/routes/notifications';
import { usersRouter } from '@/transport/http/routes/users';

type Schema = OpenApiSchema;
type Operation = OpenApiOperation;
type Document = OpenApiDocument;

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
    return app.getOpenAPI31Document({
        openapi: '3.1.0',
        info: { title: 'Astromech CMS API', version: '1.0.0' },
    }) as unknown as Document;
}

/** A schema's types, whether it names one or a type array. */
function types(schema: Schema | undefined): string[] {
    return schema?.type === undefined ? [] : [schema.type].flat();
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
        expect(paths['/entries/{type}']?.['get']?.summary).toBe(
            'List entries. Entry type: "{type}".'
        );
        expect(paths['/media/{id}']?.['delete']?.summary).toBe('Delete a media item.');
    });

    it('describes a route from its own method contract', () => {
        const doc = document();
        const post = doc.paths['/entries/{type}']?.['post'];
        expect(post?.summary).toBe('Create an entry. Entry type: "{type}".');
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

describe('the documented request bodies', () => {
    it('refuse a key the method does not declare, as the server does', () => {
        const doc = document();
        const checked: string[] = [];
        const open: string[] = [];
        for (const [path, operations] of Object.entries(doc.paths)) {
            for (const [verb, operation] of Object.entries(operations)) {
                const schema = operation.requestBody?.content['application/json'].schema;
                if (schema === undefined) continue;
                const resolved =
                    schema.$ref === undefined
                        ? schema
                        : component(
                              doc,
                              schema.$ref.replace('#/components/schemas/', '')
                          );
                if (resolved.type !== 'object') continue;
                checked.push(`${verb} ${path}`);
                if (resolved.additionalProperties !== false) open.push(`${verb} ${path}`);
            }
        }

        expect(checked.length).toBeGreaterThan(10);
        expect(open).toEqual([]);
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
        expect(types(list?.properties?.['pagination'])).toEqual(['object', 'null']);
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
        expect(responseSchema(staged, 200)?.properties?.['data']?.anyOf?.[1]).toEqual({
            type: 'null',
        });
        for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
            expect(types(schema), name).not.toContain('null');
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
        expect(entry['publishedAt']).toEqual({ ...dateTime, type: ['string', 'null'] });
        expect(component(doc, 'User').properties?.['createdAt']).toEqual(dateTime);
        expect(component(doc, 'Notification').properties?.['createdAt']).toEqual(
            dateTime
        );
    });

    it('documents `fields` as an open object', () => {
        const doc = document();
        const object = { type: 'object', additionalProperties: true };
        expect(component(doc, 'Entry').properties?.['fields']).toEqual(object);
        expect(component(doc, 'EntrySnapshot').properties?.['fields']).toEqual(object);
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
        expect(entry['slug']).toEqual({ type: ['string', 'null'] });
        expect(component(doc, 'Media').properties?.['width']).toEqual({
            type: ['number', 'null'],
        });
        expect(component(doc, 'MediaSnapshot').properties?.['alt']).toEqual({
            type: ['string', 'null'],
        });
    });
});

describe('the documented versions', () => {
    const resources = [
        ['/entries/{type}/{id}', 'Entry'],
        ['/globals/{key}', 'Global'],
        ['/media/{id}', 'Media'],
        ['/users/{id}', 'User'],
    ] as const;

    it('lists every resource’s versions as the shared metadata component', () => {
        const doc = document();
        for (const [path] of resources) {
            const list = responseSchema(doc.paths[`${path}/versions`]?.['get'], 200);
            expect(list?.properties?.['data']?.items, path).toEqual({
                $ref: '#/components/schemas/VersionMetadata',
            });
        }
        expect(Object.keys(component(doc, 'VersionMetadata').properties ?? {})).toEqual([
            'version',
            'locale',
            'createdAt',
            'createdBy',
        ]);
    });

    it('answers one version as metadata plus the resource’s snapshot', () => {
        const doc = document();
        for (const [path, name] of resources) {
            const get = doc.paths[`${path}/versions/{version}`]?.['get'];
            expect(responseSchema(get, 200)?.properties?.['data'], path).toEqual({
                $ref: `#/components/schemas/${name}Version`,
            });
            expect(responseSchema(get, 404), path).toEqual({
                $ref: '#/components/schemas/Error',
            });
            const [metadata, own] = component(doc, `${name}Version`).allOf ?? [];
            expect(metadata).toEqual({ $ref: '#/components/schemas/VersionMetadata' });
            expect(own?.properties?.['snapshot']).toEqual({
                $ref: `#/components/schemas/${name}Snapshot`,
            });
            expect(own?.required).toEqual(['snapshot']);
        }
    });

    it('narrows each snapshot to the keys a version keeps', () => {
        const doc = document();
        const keys = (name: string): string[] =>
            Object.keys(component(doc, name).properties ?? {}).sort();
        expect(keys('EntrySnapshot')).toEqual(['fields', 'slug', 'title']);
        expect(keys('GlobalSnapshot')).toEqual(['fields']);
        expect(keys('MediaSnapshot')).toEqual(['alt', 'caption', 'fields', 'title']);
        expect(keys('UserSnapshot')).toEqual(['fields']);
    });

    it('documents the version number on the path as an integer', () => {
        const doc = document();
        const get = doc.paths['/users/{id}/versions/{version}']?.['get'];
        const version = (get?.parameters ?? []).find((p) => p.name === 'version') as
            | { in: string; schema?: Schema }
            | undefined;
        expect(version?.in).toBe('path');
        expect(version?.schema).toEqual({ type: 'integer' });
    });
});

/** The statuses an operation documents, in the order the document lists them. */
function statuses(operation: Operation | undefined): string[] {
    return Object.keys(operation?.responses ?? {});
}

describe('the documented error statuses', () => {
    it('document 401 on a route whose method is public, since every table route needs a session', () => {
        // `globals.get` needs no permission for a public global, but the router
        // mounts behind `requireAuth`, and a private global or `full` read needs one.
        const get = document().paths['/globals/{key}']?.['get'];
        expect(statuses(get)).toEqual(['200', '401', '403', '404', '409', '422', '500']);
    });

    it('document 400 for the body, 403 for the permission and 422 for the input on a write', () => {
        const put = document().paths['/entries/{type}/{id}']?.['put'];
        expect(statuses(put)).toEqual([
            '200',
            '400',
            '401',
            '403',
            '404',
            '409',
            '422',
            '500',
        ]);
        expect(put?.responses['400']?.description).toBe(
            'Bad request: the body is not valid JSON.'
        );
    });

    it('document neither 403 nor 422 on a session-scoped route that takes no arguments', () => {
        const paths = document().paths;
        expect(statuses(paths['/notifications']?.['get'])).toEqual(['200', '401', '500']);
        expect(statuses(paths['/notifications']?.['delete'])).toEqual([
            '204',
            '401',
            '500',
        ]);
        // `dismiss` takes an id, so its path param can still fail the parse.
        expect(statuses(paths['/notifications/{id}']?.['delete'])).toEqual([
            '204',
            '401',
            '422',
            '500',
        ]);
    });

    it('document 400 for the sort order and keys on a list', () => {
        const paths = document().paths;
        const entries = paths['/entries/{type}']?.['get'];
        expect(statuses(entries)).toEqual([
            '200',
            '400',
            '401',
            '403',
            '404',
            '422',
            '500',
        ]);
        expect(entries?.responses['400']?.description).toBe(
            'Bad request: `dir` is not `asc` or `desc`, or `sort` names a key the list ' +
                'cannot sort by; `where` names a key the list cannot filter by; ' +
                '`trashed` is asked for without `full`.'
        );
        expect(statuses(paths['/users']?.['get'])).toEqual([
            '200',
            '400',
            '401',
            '403',
            '422',
            '500',
        ]);
        // A read with no list arguments answers no 400.
        expect(statuses(paths['/media/{id}']?.['get'])).not.toContain('400');
    });

    it('document 404 wherever the request names a type, a global, a row or a version', () => {
        const paths = document().paths;
        expect(paths['/entries/{type}']?.['post']?.responses['404']?.description).toBe(
            'No entry type matches the request.'
        );
        expect(
            paths['/entries/{type}/{id}/versions/{version}']?.['get']?.responses['404']
                ?.description
        ).toBe('No entry type, entry or version matches the request.');
        expect(
            paths['/entries/{type}/bulk-update']?.['post']?.responses['404']?.description
        ).toBe('No entry type or entry matches the request.');
        expect(paths['/entries/query']?.['post']?.responses['404']?.description).toBe(
            'No entry type matches the request.'
        );
        expect(statuses(paths['/globals/{key}/versions']?.['get'])).toContain('404');
        expect(statuses(paths['/users/{id}']?.['put'])).toContain('404');
        expect(statuses(paths['/media/{id}/used-by']?.['get'])).toContain('404');
        // Nothing addressed, nothing to miss.
        expect(statuses(paths['/users']?.['get'])).not.toContain('404');
    });

    it('document no 404 for an idempotent delete, which answers a missing row as done', () => {
        const paths = document().paths;
        for (const path of ['/users/{id}', '/media/{id}', '/notifications/{id}']) {
            expect(statuses(paths[path]?.['delete']), path).not.toContain('404');
        }
        // Deleting an entry reads it first, so a missing one is a 404.
        expect(statuses(paths['/entries/{type}/{id}']?.['delete'])).toContain('404');
    });

    it('document 409 on every route whose method requires a capability', () => {
        const doc = document();
        const catalogues: Record<string, Record<string, { requires?: string }>> = {
            entries: entriesDefinition.catalogue,
            globals: globalsDefinition.catalogue,
        };
        let checked = 0;
        for (const route of HTTP_ROUTES) {
            const [domain = '', method = ''] = route.id.split('.');
            const requires = catalogues[domain]?.[method]?.requires;
            if (requires === undefined) continue;
            const key = documentPath(route.base, route.path);
            const conflict = doc.paths[key]?.[route.verb]?.responses['409'];
            expect(conflict?.description, key).toContain(
                `does not declare \`${requires}\` (\`capability_not_supported\`)`
            );
            checked += 1;
        }
        expect(checked).toBeGreaterThan(20);
    });

    it('document the 409s no `requires` states from the row', () => {
        const paths = document().paths;
        expect(
            paths['/entries/{type}/{id}/staged']?.['post']?.responses['409']?.description
        ).toBe(
            'Conflict: the entry type does not declare `staging` ' +
                '(`capability_not_supported`); the locale already has a staged change ' +
                '(`staged_change_exists`); the entry is in the trash (`CONFLICT`, ' +
                'reason `trashed`).'
        );
        expect(paths['/entries/{type}']?.['post']?.responses['409']?.description).toBe(
            'Conflict: the body sets `status` or `publishedAt` on a type without ' +
                '`statuses`, or `slug` on one without `slug` (`capability_not_supported`).'
        );
        expect(
            paths['/entries/{type}/{id}/publish']?.['post']?.responses['409']?.description
        ).toBe(
            'Conflict: the entry type does not declare `statuses` ' +
                '(`capability_not_supported`); the entry is in the trash ' +
                '(`CONFLICT`, reason `trashed`).'
        );
        // A read with neither answers none.
        expect(statuses(paths['/entries/{type}/{id}']?.['get'])).not.toContain('409');
    });

    it('document the 409 for the last admin on the user writes that can lose one', () => {
        const paths = document().paths;
        expect(paths['/users/{id}']?.['delete']?.responses['409']?.description).toBe(
            'Conflict: the user is the last admin (`CONFLICT`, reason `last-admin`).'
        );
        expect(paths['/users/{id}']?.['put']?.responses['409']?.description).toBe(
            'Conflict: the new `role` leaves the site with no admin (`CONFLICT`, ' +
                'reason `last-admin`).'
        );
        expect(paths['/users/{id}']?.['put']?.responses['400']?.description).toBe(
            'Bad request: the body is not valid JSON.'
        );
        expect(statuses(paths['/users/{id}']?.['delete'])).not.toContain('400');
    });

    it('document the cross-type query’s `type` as one type or a list, and each status it answers', () => {
        const doc = document();
        const query = doc.paths['/entries/query']?.['post'];
        expect(statuses(query)).toEqual([
            '200',
            '400',
            '401',
            '403',
            '404',
            '422',
            '500',
        ]);
        const body = query?.requestBody?.content['application/json'].schema;
        expect(body?.properties?.['type']).toEqual({
            anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        });
        expect(body?.required).toEqual(['type']);
    });

    it('document every 422 with the validation body and every other error with the error body', () => {
        const doc = document();
        for (const [path, operations] of Object.entries(doc.paths)) {
            for (const [verb, operation] of Object.entries(operations)) {
                expect(statuses(operation), `${verb} ${path}`).toContain('401');
                expect(statuses(operation), `${verb} ${path}`).toContain('500');
                for (const [status, response] of Object.entries(operation.responses)) {
                    if (Number(status) < 400) continue;
                    expect(response.content?.['application/json'].schema).toEqual({
                        $ref: `#/components/schemas/${status === '422' ? 'ValidationError' : 'Error'}`,
                    });
                }
            }
        }
        const details = component(doc, 'ValidationError').properties?.['error']
            ?.properties?.['details'];
        expect(Object.keys(details?.properties ?? {})).toEqual([
            'fields',
            'form',
            'failedId',
            'succeededBefore',
        ]);
        expect(details?.required).toEqual(['fields']);
    });
});

describe('the served document', () => {
    /** A plugin whose methods cover the access forms and both input shapes. */
    const probe: PluginDefinition = {
        package: 'probe',
        service: {
            ping: {
                access: 'public',
                summary: 'Answer pong.',
                input: noInput(),
                output: z.literal('pong'),
                mutates: false,
                handler: () => 'pong',
            },
            whoami: {
                access: 'authenticated',
                input: noInput(),
                mutates: false,
                handler: () => null,
            },
            echo: {
                access: { permission: 'read' },
                input: z.strictObject({ text: z.string() }),
                output: z.object({ echoed: z.string() }),
                mutates: false,
                handler: ({ text }: { text: string }) => ({ echoed: text }),
            },
            latest: {
                access: 'authenticated',
                input: noInput(),
                output: entrySchema.nullable(),
                mutates: false,
                handler: () => null,
            },
        },
    };

    /** A plugin whose output takes a name core already gives another schema. */
    const clashing: PluginDefinition = {
        package: 'clashing',
        service: {
            read: {
                access: 'public',
                input: noInput(),
                output: z.object({ other: z.string() }).openapi('Entry'),
                mutates: false,
                handler: () => ({ other: '' }),
            },
        },
    };

    /** Two plugins that each name a different schema `Thing`. */
    const thing = (name: string, key: string): PluginDefinition => ({
        package: name,
        service: {
            read: {
                access: 'public',
                input: noInput(),
                output: z.object({ [key]: z.string() }).openapi('Thing'),
                mutates: false,
                handler: () => ({ [key]: '' }),
            },
        },
    });

    it('declares OpenAPI 3.1, the API base as its server and the session as its security', () => {
        const { api, document: doc } = servedDocument([probe]);
        expect(doc.openapi).toBe('3.1.0');
        expect(doc.servers).toEqual([{ url: api }]);
        expect(Object.keys(doc.paths)).toContain('/entries/{type}');
        expect(doc.security).toEqual([{ sessionCookie: [] }]);
        expect(doc.components?.securitySchemes?.['sessionCookie']).toMatchObject({
            type: 'apiKey',
            in: 'cookie',
            name: 'better-auth.session_token',
        });
        // A public method is served without a session, so it asks for none.
        expect(doc.paths['/plugins/probe/ping']?.['post']?.security).toEqual([]);
        expect(doc.paths['/plugins/probe/echo']?.['post']?.security).toBeUndefined();
    });

    it('names every operation by a unique id, its method id where it has one route', () => {
        const { document: doc } = servedDocument([probe]);
        const ids = Object.values(doc.paths).flatMap((operations) =>
            Object.values(operations).map((operation) => operation.operationId)
        );
        expect(ids.every((id) => typeof id === 'string' && id !== '')).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);

        const id = (path: string, verb: string): string | undefined =>
            doc.paths[path]?.[verb]?.operationId;
        expect(id('/entries/{type}/{id}', 'put')).toBe('entries.update');
        expect(id('/entries/{type}/bulk-update', 'post')).toBe('entries.updateMany');
        expect(id('/entries/{type}/query', 'post')).toBe('entries.query');
        expect(id('/entries/query', 'post')).toBe('entries.queryMany');
        expect(id('/entries/{type}', 'get')).toBe('entries.queryGet');
        expect(id('/users/{id}', 'delete')).toBe('users.delete');
        expect(id('/plugins/probe/echo', 'post')).toBe('plugins.probe.echo');
        expect(id('/me', 'get')).toBe('me.get');
    });

    it('documents `/me` as the signed-in user and their role', () => {
        const { document: doc } = servedDocument([]);
        const me = doc.paths['/me']?.['get'];
        expect(statuses(me)).toEqual(['200', '401', '500']);
        expect(responseSchema(me, 200)?.properties?.['data']).toEqual({
            $ref: '#/components/schemas/Me',
        });
        expect(component(doc, 'Me').properties).toEqual({
            user: { $ref: '#/components/schemas/User' },
            role: { $ref: '#/components/schemas/Role' },
        });
        expect(Object.keys(component(doc, 'Role').properties ?? {})).toEqual([
            'slug',
            'name',
            'permissions',
            'isBuiltIn',
        ]);
    });

    it('documents a plugin method’s input as its body and its output as the bare 200', () => {
        const { document: doc, warnings } = servedDocument([probe]);
        const echo = doc.paths['/plugins/probe/echo']?.['post'];
        expect(bodyProperties(echo, doc)).toEqual(['text']);
        expect(responseSchema(echo, 200)?.properties?.['echoed']).toEqual({
            type: 'string',
        });
        expect(statuses(echo)).toEqual(['200', '401', '403', '422', '500']);
        expect(warnings).toEqual([]);
    });

    it('documents no body, and no 422, for a plugin method that takes no arguments', () => {
        const { document: doc } = servedDocument([probe]);
        const whoami = doc.paths['/plugins/probe/whoami']?.['post'];
        expect(whoami?.requestBody).toBeUndefined();
        // Signed in is enough, so there is nothing to refuse with a 403.
        expect(statuses(whoami)).toEqual(['200', '401', '500']);
        // No `output`, so the 200 names no schema.
        expect(whoami?.responses['200']?.content).toBeUndefined();
    });

    it('documents no 401 or 403 for a public plugin method', () => {
        const { document: doc } = servedDocument([probe]);
        const ping = doc.paths['/plugins/probe/ping']?.['post'];
        expect(ping?.summary).toBe('Answer pong.');
        expect(statuses(ping)).toEqual(['200', '500']);
    });

    it('shares a core component a plugin output reuses', () => {
        const { document: doc, warnings } = servedDocument([probe]);
        const latest = doc.paths['/plugins/probe/latest']?.['post'];
        expect(responseSchema(latest, 200)?.anyOf?.[0]).toEqual({
            $ref: '#/components/schemas/Entry',
        });
        expect(warnings).toEqual([]);
    });

    it('leaves a plugin schema undescribed when its component name is core’s', () => {
        const before = component(servedDocument([]).document, 'Entry');
        const { document: doc, warnings } = servedDocument([clashing]);
        expect(component(doc, 'Entry')).toEqual(before);
        const read = doc.paths['/plugins/clashing/read']?.['post'];
        expect(read?.responses['200']?.content).toBeUndefined();
        expect(warnings).toEqual([
            expect.stringContaining(
                'leaves the output schema of plugins.clashing.read undescribed: it names ' +
                    'the component "Entry", which core names for a different schema'
            ),
        ]);
    });

    it('leaves the second of two plugins that name different schemas alike undescribed', () => {
        const { document: doc, warnings } = servedDocument([
            thing('first', 'a'),
            thing('second', 'b'),
        ]);
        expect(Object.keys(component(doc, 'Thing').properties ?? {})).toEqual(['a']);
        expect(responseSchema(doc.paths['/plugins/first/read']?.['post'], 200)).toEqual({
            $ref: '#/components/schemas/Thing',
        });
        expect(
            doc.paths['/plugins/second/read']?.['post']?.responses['200']?.content
        ).toBeUndefined();
        expect(warnings).toEqual([
            expect.stringContaining('which plugin "first" names for a different schema'),
        ]);
    });
});
