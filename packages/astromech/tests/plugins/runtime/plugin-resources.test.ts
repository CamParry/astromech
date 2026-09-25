/**
 * Plugin admin resources: the config-time check against the plugin's service
 * and fields, and the admin config form with each method's permission resolved.
 */

import type {
    AdminResource,
    AnyServiceMethod,
    PluginDefinition,
    ServiceMethodAccess,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertPluginsValid } from '@/config/plugins';
import { defineAdminResource } from '@/plugins/define-admin-resource';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { resolveAdminResources } from '@/plugins/runtime/plugin-resources';

const method = (access: ServiceMethodAccess<never>): AnyServiceMethod => ({
    access,
    input: z.looseObject({}),
    mutates: false,
    handler: () => null,
});

const redirects = (overrides: Partial<AdminResource> = {}): AdminResource =>
    defineAdminResource({
        name: 'redirects',
        label: 'Redirects',
        labelSingular: 'Redirect',
        fields: [
            { name: 'from', type: 'text' },
            { name: 'to', type: 'text' },
            {
                type: 'group',
                fields: [{ name: 'statusCode', type: 'number' }],
            },
        ],
        columns: [{ field: 'from', sortable: true }, 'to', 'statusCode'],
        methods: { list: 'list', get: 'get', create: 'create', delete: 'remove' },
        ...overrides,
    });

const plugin = (resources: AdminResource[]): PluginDefinition => ({
    package: '@astromech/redirects',
    service: {
        list: method({ permission: 'read' }),
        get: method({ permission: 'read' }),
        create: method({ permission: 'write' }),
        remove: method({ permission: 'content:delete' }),
        lookup: method('public'),
    },
    admin: { resources },
});

describe('assertPluginsValid — admin resources', () => {
    it('passes a resource over declared methods and fields', () => {
        expect(() => assertPluginsValid([plugin([redirects()])])).not.toThrow();
    });

    it('rejects a method the service does not declare, naming plugin, resource and method', () => {
        expect(() =>
            assertPluginsValid([
                plugin([redirects({ methods: { list: 'list', update: 'save' } })]),
            ])
        ).toThrow(
            'Astromech plugin "@astromech/redirects" admin resource "redirects": ' +
                'its update method "save" is not a method of the plugin\'s `service`.'
        );
    });

    it('rejects a method that declares no permission', () => {
        expect(() =>
            assertPluginsValid([plugin([redirects({ methods: { list: 'lookup' } })])])
        ).toThrow(/its list method "lookup" must declare `access: \{ permission \}`/);
    });

    it('does not take an inherited property for a method', () => {
        expect(() =>
            assertPluginsValid([plugin([redirects({ methods: { list: 'toString' } })])])
        ).toThrow(/its list method "toString" is not a method/);
    });

    it('rejects a name used twice in one plugin', () => {
        expect(() => assertPluginsValid([plugin([redirects(), redirects()])])).toThrow(
            /admin resource "redirects": the name is declared twice/
        );
    });

    it('rejects a name that is not one URL segment', () => {
        expect(() =>
            assertPluginsValid([plugin([redirects({ name: 'Redirect/rules' })])])
        ).toThrow(/admin resource "Redirect\/rules": a name is lowercase letters/);
    });

    it('rejects a column that names no top-level data field', () => {
        expect(() =>
            assertPluginsValid([
                plugin([redirects({ columns: ['from', { field: 'hits' }] })]),
            ])
        ).toThrow(/the column "hits" is not a top-level data field/);
    });
});

describe('resolveAdminResources', () => {
    const resolve = (def: PluginDefinition) =>
        resolveAdminResources(resolvePluginIdentity(def), def);

    it('resolves each declared method with its permission under the plugin namespace', () => {
        const [resource] = resolve(plugin([redirects()]));

        expect(resource?.methods).toEqual({
            list: { name: 'list', permission: 'plugin:redirects:read' },
            get: { name: 'get', permission: 'plugin:redirects:read' },
            create: { name: 'create', permission: 'plugin:redirects:write' },
            delete: { name: 'remove', permission: 'content:delete' },
        });
    });

    it('normalises columns and defaults search to false', () => {
        const [resource] = resolve(plugin([redirects()]));

        expect(resource?.columns).toEqual([
            { field: 'from', sortable: true },
            { field: 'to', sortable: false },
            { field: 'statusCode', sortable: false },
        ]);
        expect(resource?.search).toBe(false);
        expect(resource).not.toHaveProperty('icon');
    });

    it('carries the labels, icon, fields and search as declared', () => {
        const declared = redirects({ icon: 'Signpost', search: true });
        const [resource] = resolve(plugin([declared]));

        expect(resource).toMatchObject({
            name: 'redirects',
            label: 'Redirects',
            labelSingular: 'Redirect',
            icon: 'Signpost',
            fields: declared.fields,
            search: true,
        });
    });

    it('resolves nothing for a plugin without resources', () => {
        expect(resolve({ package: 'empty' })).toEqual([]);
    });
});
