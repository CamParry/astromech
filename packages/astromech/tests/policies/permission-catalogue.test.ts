import type { AstromechConfig, DatabaseDriver } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { describe, expect, it } from 'vitest';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { resolveConfig } from '@/config/resolve';
import { isGlobalCapability } from '@/globals/capabilities';
import { globalsDefinition } from '@/globals/service';
import { resolveAccess } from '@/permissions/access';
import { CORE_PERMISSIONS } from '@/permissions/core-permissions';
import { definePermissions } from '@/permissions/define';
import { definePlugin } from '@/plugins/define-plugin';
import { buildPermissionCatalogue } from '@/policies/permission-catalogue';

describe('buildPermissionCatalogue', () => {
    const driver: DatabaseDriver = {
        name: 'test',
        getInstance() {
            throw new Error('not called');
        },
    };

    const catalogued = definePlugin({
        package: '@astromech/redirects',
        permissions: definePermissions({
            lookup: {
                label: 'Look up a redirect',
                description: 'Resolve a path against the redirect table.',
            },
        }),
        entries: [
            {
                type: 'redirect',
                single: 'Redirect',
                plural: 'Redirects',
                fields: [{ name: 'from', type: 'text' }],
            },
        ],
        globals: [
            {
                key: 'settings',
                label: 'Settings',
                fields: [{ name: 'enabled', type: 'boolean' }],
            },
        ],
    });
    const pluginDefinition = catalogued();

    const resolved = resolveConfig({
        db: driver,
        storage: noopStorage,
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
                fields: [{ name: 'title', type: 'text' }],
            },
            notes: {
                single: 'Note',
                plural: 'Notes',
                statuses: false,
                versioning: true,
                fields: [{ name: 'title', type: 'text' }],
            },
        },
        globals: [
            {
                key: 'site',
                label: 'Site',
                fields: [{ name: 'tagline', type: 'text' }],
            },
            {
                key: 'footer',
                label: 'Footer',
                versioning: false,
                fields: [{ name: 'copyright', type: 'text' }],
            },
            {
                key: 'banner',
                label: 'Banner',
                statuses: false,
                fields: [{ name: 'message', type: 'text' }],
            },
        ],
        plugins: [pluginDefinition],
    } satisfies AstromechConfig);

    const catalogue = buildPermissionCatalogue(resolved, [pluginDefinition]);
    const find = (permission: string) =>
        catalogue.find((p) => p.permission === permission);

    it('includes every core permission verbatim', () => {
        const core = catalogue.filter((p) => p.source === 'core');
        expect(core.map((p) => p.permission).sort()).toEqual(
            Object.keys(CORE_PERMISSIONS).sort()
        );
        expect(find('media:upload')?.label).toBe(CORE_PERMISSIONS['media:upload'].label);
        expect(find('media:upload')?.owner).toBeUndefined();
        expect(find('media:update')?.label).toBe(CORE_PERMISSIONS['media:update'].label);
        expect(find('media:update')?.owner).toBeUndefined();
    });

    it('derives entry permissions for a root type', () => {
        const entry = find('entry:posts:update');
        expect(entry?.source).toBe('entry');
        expect(entry?.label).toBe('Update "posts" entries');
        expect(entry?.owner).toBe('posts');
    });

    it('derives plugin-scoped entry permissions for a plugin-mounted type', () => {
        const entry = find('plugin:redirects:entry:redirect:create');
        expect(entry?.source).toBe('entry');
        expect(entry?.owner).toBe('redirects/redirect');
    });

    it('offers publish for a type with statuses, whatever its versioning', () => {
        expect(find('entry:posts:publish')).toBeDefined();
        expect(find('entry:pages:publish')?.label).toBe('Publish "pages" entries');
        expect(find('plugin:redirects:entry:redirect:publish')).toBeDefined();
        expect(find('entry:notes:publish')).toBeUndefined();
    });

    it('namespaces a plugin declaration', () => {
        const entry = find('plugin:redirects:lookup');
        expect(entry?.source).toBe('plugin');
        expect(entry?.label).toBe('Look up a redirect');
        expect(entry?.description).toBe('Resolve a path against the redirect table.');
        expect(entry?.owner).toBe('redirects');
    });

    it('derives global permissions for a host global', () => {
        const global = find('global:site:update');
        expect(global?.source).toBe('global');
        expect(global?.label).toBe('Update "site" global');
        expect(global?.owner).toBe('site');
        expect(find('global:site:read')).toBeDefined();
        expect(find('global:site:publish')).toBeDefined();
    });

    it('offers no global create or delete', () => {
        expect(find('global:site:create')).toBeUndefined();
        expect(find('global:site:delete')).toBeUndefined();
    });

    it('offers publish for a global with statuses, whatever its versioning', () => {
        expect(find('global:footer:publish')?.label).toBe('Publish "footer" global');
        expect(find('global:banner:update')).toBeDefined();
        expect(find('global:banner:publish')).toBeUndefined();
    });

    it('derives plugin-scoped global permissions for a plugin global', () => {
        const global = find('plugin:redirects:global:settings:update');
        expect(global?.source).toBe('global');
        expect(global?.owner).toBe('redirects/settings');
    });

    it('lists every permission a method of the config demands', () => {
        const listed = new Set(catalogue.map((p) => p.permission));
        const demanded: string[] = [];
        for (const method of generateMethodManifest(resolved, [pluginDefinition])
            .methods) {
            if (method.permission !== null) demanded.push(method.permission);
        }
        // The manifest names `globals.*` once for every global, so its
        // permission is dynamic: resolve each method per global it can serve.
        for (const global of Object.values(resolved.globals)) {
            for (const method of Object.values(globalsDefinition.catalogue)) {
                const { requires } = method;
                if (
                    requires !== undefined &&
                    !(isGlobalCapability(requires) && global.capabilities[requires])
                ) {
                    continue;
                }
                // The private shape is the call that demands a permission even
                // of a public global.
                const access = resolveAccess(method.access, {
                    key: global.id,
                    full: true,
                });
                if (access.kind === 'permission') demanded.push(...access.permissions);
            }
        }

        const missing = new Set(demanded.filter((permission) => !listed.has(permission)));
        expect([...missing]).toEqual([]);
    });

    it('sorts by source group, then by permission string within the group', () => {
        const order = ['core', 'entry', 'global', 'plugin'];
        const groups = catalogue.map((p) => order.indexOf(p.source));
        expect(groups).toEqual([...groups].sort((a, b) => a - b));

        for (const source of order) {
            const permissions = catalogue
                .filter((p) => p.source === source)
                .map((p) => p.permission);
            expect(permissions).toEqual([...permissions].sort());
        }
    });
});
