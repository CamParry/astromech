/**
 * The method manifest generated from one config: a versioned, an unversioned
 * and a staging entry type, plus a plugin with an entry type and three service
 * methods. What each method declares is one row of the table; the rules every
 * method of a kind keeps are checked over the whole manifest.
 */

import type {
    EntriesManifestMethod,
    JsonSchemaObject,
    ManifestMethod,
    MethodManifest,
    PluginDefinition,
} from '@/types/index';
import { resolveTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    generateMethodManifest,
    serialiseMethodManifest,
} from '@/codegen/method-manifest';

/** Plugin with an entry type and three service methods covering the access forms. */
const testPlugin: PluginDefinition = {
    package: '@test/my-plugin',
    entries: [
        {
            type: 'widget',
            single: 'Widget',
            plural: 'Widgets',
            fields: [{ name: 'title', type: 'text' }],
        },
    ],
    service: {
        doSomething: {
            access: { permission: 'plugins:x:do' },
            summary: 'Do something.',
            input: z.object({ thing: z.string() }),
            mutates: true,
            handler: async () => undefined,
        },
        readOnly: {
            access: 'public',
            input: z.object({}),
            output: z.object({ count: z.number() }),
            mutates: false,
            handler: async () => undefined,
        },
        scoped: {
            // A bare permission key, scoped to the plugin as the route enforces it.
            access: { permission: 'manage' },
            input: z.object({}),
            mutates: true,
            handler: async () => undefined,
        },
    },
};

const resolved = resolveTestConfig({
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            fields: [{ name: 'title', type: 'text' }],
        },
        pages: {
            single: 'Page',
            plural: 'Pages',
            versioning: false,
            fields: [{ name: 'title', type: 'text' }],
        },
        articles: {
            single: 'Article',
            plural: 'Articles',
            versioning: true,
            staging: true,
            fields: [{ name: 'title', type: 'text' }],
        },
    },
    plugins: [testPlugin],
});

const manifest: MethodManifest = generateMethodManifest(resolved, [testPlugin]);

/** The method `name`, for entry methods of the type `typeId`. Throws when absent. */
function method(name: string, typeId?: string): ManifestMethod {
    const found = find(name, typeId);
    if (found === undefined)
        throw new Error(`No manifest method ${name} ${typeId ?? ''}`);
    return found;
}

/** The method `name`, for entry methods of the type `typeId`, if the manifest has it. */
function find(name: string, typeId?: string): ManifestMethod | undefined {
    return manifest.methods.find(
        (m) =>
            m.name === name &&
            (typeId === undefined || (m.source === 'entries' && m.typeId === typeId))
    );
}

/** The `properties` of a JSON schema, or of the first branch of an `anyOf`. */
function properties(schema: JsonSchemaObject | null | undefined): JsonSchemaObject {
    const branch = (schema?.['anyOf'] as JsonSchemaObject[] | undefined)?.[0] ?? schema;
    return (branch?.['properties'] as JsonSchemaObject | undefined) ?? {};
}

describe('the manifest document', () => {
    it('is version 3', () => {
        expect(manifest.version).toBe(3);
    });

    it('serialises to the manifest as JSON, with a trailing newline', () => {
        const serialised = serialiseMethodManifest(manifest);

        expect(serialised.endsWith('}\n')).toBe(true);
        expect(serialised.startsWith('{\n  "version": 3,\n  "methods": [\n')).toBe(true);
        expect(JSON.parse(serialised)).toEqual(manifest);
    });
});

/** One row of the declarations table: a method, and what it must declare. */
type Declaration = { name: string; typeId?: string; declares: Partial<ManifestMethod> };

/** Each row with a label naming the method, and its entry type when it has one. */
function labelled(rows: Declaration[]): (Declaration & { label: string })[] {
    return rows.map((row) => ({
        ...row,
        label: row.typeId === undefined ? row.name : `${row.name} for ${row.typeId}`,
    }));
}

describe('what each method declares', () => {
    it.each(
        labelled([
            {
                name: 'users.create',
                declares: { source: 'core', permission: 'users:create', mutates: true },
            },
            { name: 'users.delete', declares: { destructive: true } },
            { name: 'users.query', declares: { mutates: false } },
            {
                name: 'globals.update',
                declares: { permission: null, permissionDynamic: true },
            },
            { name: 'globals.get', declares: { mutates: false } },
            { name: 'globals.versions', declares: { mutates: false } },
            { name: 'globals.unpublish', declares: { destructive: true } },
            {
                name: 'entries.query',
                typeId: 'posts',
                declares: {
                    source: 'entries',
                    permission: 'entry:posts:read',
                    mutates: false,
                },
            },
            {
                name: 'entries.get',
                typeId: 'posts',
                declares: { permission: 'entry:posts:read' },
            },
            {
                name: 'entries.delete',
                typeId: 'posts',
                declares: { destructive: true, mutates: true },
            },
            { name: 'entries.update', typeId: 'posts', declares: { idempotent: true } },
            { name: 'entries.create', typeId: 'posts', declares: { idempotent: false } },
            {
                name: 'entries.publish',
                typeId: 'posts',
                declares: { permission: 'entry:posts:publish' },
            },
            // Publish needs `statuses`, not `versioning`, so an unversioned type has it.
            {
                name: 'entries.publish',
                typeId: 'pages',
                declares: { permission: 'entry:pages:publish' },
            },
            {
                name: 'entries.publish',
                typeId: 'articles',
                declares: { permission: 'entry:articles:publish' },
            },
            {
                name: 'entries.createStaged',
                typeId: 'articles',
                declares: { permission: 'entry:articles:update', mutates: true },
            },
            {
                name: 'entries.getStaged',
                typeId: 'articles',
                declares: { permission: 'entry:articles:read', mutates: false },
            },
            {
                name: 'entries.mergeStaged',
                typeId: 'articles',
                declares: { permission: 'entry:articles:publish', mutates: true },
            },
            {
                name: 'entries.deleteStaged',
                typeId: 'articles',
                declares: { permission: 'entry:articles:update', mutates: true },
            },
            {
                name: 'entries.issuePreviewToken',
                typeId: 'articles',
                declares: { permission: 'entry:articles:update', mutates: true },
            },
            {
                name: 'entries.revokePreviewToken',
                typeId: 'articles',
                declares: { permission: 'entry:articles:update', mutates: true },
            },
            {
                name: 'entries.query',
                typeId: 'test_my_plugin/widget',
                declares: { source: 'entries', plugin: 'test_my_plugin' },
            },
            {
                name: 'entries.create',
                typeId: 'test_my_plugin/widget',
                declares: { permission: 'plugin:test_my_plugin:entry:widget:create' },
            },
            {
                name: 'entries.get',
                typeId: 'test_my_plugin/widget',
                declares: { permission: 'plugin:test_my_plugin:entry:widget:read' },
            },
            {
                name: 'plugins.testMyPlugin.doSomething',
                declares: {
                    source: 'plugin',
                    access: 'permission',
                    permission: 'plugins:x:do',
                    mutates: true,
                    summary: 'Do something.',
                },
            },
            {
                name: 'plugins.testMyPlugin.readOnly',
                declares: { access: 'public', permission: null, mutates: false },
            },
            {
                name: 'plugins.testMyPlugin.scoped',
                declares: { permission: 'plugin:test_my_plugin:manage' },
            },
        ])
    )('$label', ({ name, typeId, declares }) => {
        expect(method(name, typeId)).toMatchObject(declares);
    });

    it('leaves the site’s own entry methods without a plugin', () => {
        expect(method('entries.query', 'posts')).not.toHaveProperty('plugin');
    });
});

describe('which methods it holds', () => {
    it('emits one core method per GlobalsService verb', () => {
        for (const verb of [
            'get',
            'update',
            'publish',
            'unpublish',
            'schedule',
            'versions',
            'restoreVersion',
            'createStaged',
            'getStaged',
            'mergeStaged',
            'deleteStaged',
        ]) {
            expect(method(`globals.${verb}`), verb).toMatchObject({
                source: 'core',
                module: 'globals',
            });
        }
    });

    it('holds the media, notifications and security core methods', () => {
        const names = manifest.methods.map((m) => m.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'media.upload',
                'notifications.list',
                'security.listBlocked',
            ])
        );
    });

    it('names every method from its catalogue key, never "(unnamed)"', () => {
        expect(manifest.methods.map((m) => m.name)).not.toContain('(unnamed)');
    });

    it('omits the versioning- and staging-gated methods for an unversioned type', () => {
        const names = manifest.methods
            .filter((m) => m.source === 'entries' && m.typeId === 'pages')
            .map((m) => m.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'entries.query',
                'entries.get',
                'entries.create',
                'entries.update',
                'entries.delete',
            ])
        );
        expect(names).not.toContain('entries.versions');
        expect(names).not.toContain('entries.restoreVersion');
        expect(names).not.toContain('entries.createStaged');
    });

    it('emits no staged-entry method for a type without staging', () => {
        for (const verb of [
            'createStaged',
            'getStaged',
            'mergeStaged',
            'deleteStaged',
            'issuePreviewToken',
            'revokePreviewToken',
        ]) {
            expect(find(`entries.${verb}`, 'posts'), verb).toBeUndefined();
            expect(find(`entries.${verb}`, 'pages'), verb).toBeUndefined();
        }
    });
});

describe('the rules every method of a kind keeps', () => {
    it('gives every core method an input schema', () => {
        const core = manifest.methods.filter((m) => m.source === 'core');
        expect(core.length).toBeGreaterThan(0);
        for (const m of core) expect(m.input, m.id).toEqual(expect.any(Object));
    });

    it('marks every core and entry input as refusing unknown keys', () => {
        const inputs = manifest.methods.filter((m) => m.source !== 'plugin');
        expect(inputs.length).toBeGreaterThan(40);
        for (const m of inputs) {
            expect(m.input?.['additionalProperties'], m.id).toBe(false);
        }
    });

    it('names its own type in every entry method’s input', () => {
        expect(
            properties(method('entries.get', 'test_my_plugin/widget').input)['type']
        ).toEqual({
            type: 'string',
            const: 'test_my_plugin/widget',
        });

        const entries = manifest.methods.filter(
            (m): m is EntriesManifestMethod => m.source === 'entries'
        );
        expect(entries.length).toBeGreaterThan(0);
        for (const m of entries) {
            expect(properties(m.input)['type'], m.id).toEqual({
                type: 'string',
                const: m.typeId,
            });
        }
    });

    it('gives every entry method an output schema', () => {
        const entries = manifest.methods.filter((m) => m.source === 'entries');
        for (const m of entries) expect(m.output, m.id).toEqual(expect.any(Object));
    });

    it('marks no restoreVersion idempotent, since each call saves a version', () => {
        const restores = manifest.methods.filter((m) =>
            m.name.endsWith('.restoreVersion')
        );
        expect(restores.map((m) => m.name)).toEqual(
            expect.arrayContaining([
                'users.restoreVersion',
                'media.restoreVersion',
                'globals.restoreVersion',
                'entries.restoreVersion',
            ])
        );
        for (const m of restores) expect(m.idempotent, m.id).toBe(false);
    });

    it('marks every deleteStaged destructive, since it discards unmerged edits', () => {
        const deletes = manifest.methods.filter((m) => m.name.endsWith('.deleteStaged'));
        expect(deletes.map((m) => m.name)).toEqual(
            expect.arrayContaining(['globals.deleteStaged', 'entries.deleteStaged'])
        );
        for (const m of deletes) expect(m.destructive, m.id).toBe(true);
    });
});

describe('input schemas', () => {
    it('describe users.update as the method’s { id, locale, data }, not the body', () => {
        const input = method('users.update').input;
        expect(Object.keys(properties(input))).toEqual(['id', 'locale', 'data']);
        expect(input?.['required']).toEqual(['id', 'data']);
        expect(
            Object.keys(properties(properties(input)['data'] as JsonSchemaObject))
        ).toContain('fields');
    });

    it('describe globals.update as { key, locale, staged, data }', () => {
        const input = method('globals.update').input;
        expect(Object.keys(properties(input))).toEqual([
            'key',
            'locale',
            'staged',
            'data',
        ]);
        expect(
            Object.keys(properties(properties(input)['data'] as JsonSchemaObject))
        ).toEqual(['fields', 'status', 'publishedAt']);
    });

    it('describe an entry update as { type, id, ids, locale, staged, data }', () => {
        const input = method('entries.update', 'posts').input;
        expect(Object.keys(properties(input))).toEqual([
            'type',
            'id',
            'ids',
            'locale',
            'staged',
            'data',
        ]);
        // `data` is the update payload, not a flattened patch.
        expect(
            Object.keys(properties(properties(input)['data'] as JsonSchemaObject))
        ).toContain('title');
    });

    it('require id for a one-entry method', () => {
        expect(method('entries.get', 'posts').input?.['required']).toContain('id');
    });

    it('offer id or ids, requiring neither, on a bulk-capable method', () => {
        for (const name of ['entries.update', 'entries.delete']) {
            const input = method(name, 'posts').input;
            expect(Object.keys(properties(input)), name).toEqual(
                expect.arrayContaining(['id', 'ids'])
            );
            const required = (input?.['required'] as string[] | undefined) ?? [];
            expect(required, name).not.toContain('id');
            expect(required, name).not.toContain('ids');
        }
    });
});

describe('output schemas', () => {
    it('describe a plugin method’s declared output', () => {
        expect(
            properties(method('plugins.testMyPlugin.readOnly').output)['count']
        ).toEqual({
            type: 'number',
        });
    });

    it('describe an entry read as the public entry', () => {
        const keys = Object.keys(properties(method('entries.get', 'posts').output));
        expect(keys).toEqual(expect.arrayContaining(['id', 'type', 'title', 'fields']));
        expect(keys).not.toContain('contentId');
    });

    it('document a date as the ISO string it crosses JSON as', () => {
        const dateTime = { type: 'string', format: 'date-time' };
        expect(properties(method('users.update').output)['createdAt']).toEqual(dateTime);
        expect(properties(method('media.get').output)['updatedAt']).toEqual(dateTime);
    });

    it('document a fallback key as its nullable inner type', () => {
        expect(properties(method('media.get').output)['width']).toMatchObject({
            anyOf: [{ type: 'number' }, { type: 'null' }],
        });
    });
});
