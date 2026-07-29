import { describe, expect, it } from 'vitest';
import type {
    AstromechConfig,
    DatabaseDriver,
    Permission,
    Role,
    StorageDriver,
} from '@/types/index.js';
import {
    hasPermission,
    can,
    builtInRole,
    BUILT_IN_ROLES,
    CORE_PERMISSIONS,
    definePermissions,
    entryPermissions,
    resolveRoles,
} from '@/permissions/index.js';
import { buildPermissionCatalogue } from '@/permissions/catalogue.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import { definePlugin } from '@/index.js';

// ============================================================================
// hasPermission — new grammar (resource[:identifier]:action, action last)
// ============================================================================

describe('hasPermission', () => {
    describe('exact match', () => {
        it('grants exact permission', () => {
            expect(hasPermission(['entry:redirect:read'], 'entry:redirect:read')).toBe(
                true
            );
        });

        it('rejects wrong action', () => {
            expect(hasPermission(['entry:redirect:read'], 'entry:redirect:update')).toBe(
                false
            );
        });
    });

    describe('viewer shape — action-last with mid-wildcard', () => {
        it('entry:*:read grants any collection:read', () => {
            expect(hasPermission(['entry:*:read'], 'entry:posts:read')).toBe(true);
        });

        it('entry:*:read does not grant different action', () => {
            expect(hasPermission(['entry:*:read'], 'entry:posts:update')).toBe(false);
        });
    });

    describe('editor collapse — trailing wildcard', () => {
        it('entry:* grants any entry action on any collection', () => {
            expect(hasPermission(['entry:*'], 'entry:posts:publish')).toBe(true);
            expect(hasPermission(['entry:*'], 'entry:pages:create')).toBe(true);
        });

        it('entry:* does not grant non-entry permissions', () => {
            expect(hasPermission(['entry:*'], 'media:read')).toBe(false);
        });

        it('entry:* does not leak into plugin tree', () => {
            expect(
                hasPermission(['entry:*'], 'plugin:redirects:entry:redirect:read')
            ).toBe(false);
        });
    });

    describe('plugin tree', () => {
        it('per-plugin wildcard grants own keys, including deep paths', () => {
            const granted = ['plugin:redirects:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:redirects:lookup')).toBe(true);
            expect(hasPermission(granted, 'plugin:redirects:entry:redirect:read')).toBe(
                true
            );
        });

        it('per-plugin wildcard does not grant sibling plugin', () => {
            const granted = ['plugin:redirects:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:seo:write')).toBe(false);
        });

        it('plugin:* grants all plugin permissions', () => {
            const granted = ['plugin:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:redirects:lookup')).toBe(true);
            expect(hasPermission(granted, 'plugin:seo:write')).toBe(true);
        });

        it('plugin:* does not grant non-plugin permissions', () => {
            expect(hasPermission(['plugin:*' as Permission], 'entry:posts:read')).toBe(
                false
            );
        });
    });

    describe('global wildcard', () => {
        it('* grants everything', () => {
            expect(hasPermission(['*'], 'entry:posts:publish')).toBe(true);
            expect(hasPermission(['*'], 'users:delete')).toBe(true);
            expect(hasPermission(['*'], 'plugin:seo:view')).toBe(true);
        });
    });
});

// ============================================================================
// can() — built-in roles secure-by-default
// ============================================================================

describe('can — built-in roles', () => {
    const roles = resolveRoles({});
    const editorRole = roles['editor'] as Role;
    const adminRole = roles['admin'] as Role;

    describe('editor role', () => {
        it('can publish entries', () => {
            expect(can(editorRole, 'entry:posts:publish')).toBe(true);
        });

        it('can upload media', () => {
            expect(can(editorRole, 'media:upload')).toBe(true);
        });

        it('cannot read users', () => {
            expect(can(editorRole, 'users:read')).toBe(false);
        });

        it('cannot update settings', () => {
            expect(can(editorRole, 'settings:update')).toBe(false);
        });

        it('cannot access plugin permissions', () => {
            expect(can(editorRole, 'plugin:seo:view' as Permission)).toBe(false);
        });
    });

    describe('admin role', () => {
        it('grants everything via * wildcard', () => {
            expect(can(adminRole, 'entry:posts:publish')).toBe(true);
            expect(can(adminRole, 'users:delete')).toBe(true);
            expect(can(adminRole, 'settings:update')).toBe(true);
            expect(can(adminRole, 'plugin:seo:view' as Permission)).toBe(true);
        });
    });
});

// ============================================================================
// BUILT_IN_ROLES shape check
// ============================================================================

describe('BUILT_IN_ROLES', () => {
    it('editor has entry:* and media permissions but not users/settings', () => {
        const editorBuiltIn = BUILT_IN_ROLES['editor'];
        if (!editorBuiltIn) throw new Error('editor built-in role missing');
        const { permissions } = editorBuiltIn;
        expect(permissions).toContain('entry:*');
        expect(permissions).toContain('media:read');
        expect(permissions).toContain('media:upload');
        expect(permissions).toContain('media:delete');
        expect(permissions).not.toContain('users:read');
        expect(permissions).not.toContain('settings:read');
    });

    it('admin has * wildcard only', () => {
        const adminBuiltIn = BUILT_IN_ROLES['admin'];
        if (!adminBuiltIn) throw new Error('admin built-in role missing');
        expect(adminBuiltIn.permissions).toEqual(['*']);
    });
});

// ============================================================================
// builtInRole — defensive copy of a built-in role's permissions
// ============================================================================

describe('builtInRole', () => {
    it('returns the editor permissions including entry:*', () => {
        expect(builtInRole('editor')).toContain('entry:*');
    });

    it('returns a defensive copy — mutating it does not affect BUILT_IN_ROLES', () => {
        const copy = builtInRole('editor');
        copy.push('users:read');
        expect(BUILT_IN_ROLES.editor.permissions).not.toContain('users:read');
    });
});

// ============================================================================
// definePermissions — bare keys only
// ============================================================================

describe('definePermissions', () => {
    it('returns the declaration unchanged', () => {
        const declaration = definePermissions({ lookup: { label: 'Look up' } });
        expect(declaration).toEqual({ lookup: { label: 'Look up' } });
    });

    it('rejects a key containing ":"', () => {
        expect(() =>
            definePermissions({ 'entry:redirect:read': { label: 'Read redirects' } })
        ).toThrow(/one level deep/);
    });
});

// ============================================================================
// entryPermissions — derived grants for a (plugin) entry type
// ============================================================================

describe('entryPermissions', () => {
    it('maps every action for a plugin-mounted type', () => {
        expect(
            entryPermissions('redirects/redirect', 'read', 'create', 'delete')
        ).toEqual([
            'plugin:redirects:entry:redirect:read',
            'plugin:redirects:entry:redirect:create',
            'plugin:redirects:entry:redirect:delete',
        ]);
    });

    it('maps every action for a root type', () => {
        expect(entryPermissions('posts', 'read', 'publish')).toEqual([
            'entry:posts:read',
            'entry:posts:publish',
        ]);
    });

    it('throws when no action is given', () => {
        expect(() => entryPermissions('posts')).toThrow(/at least one action/);
    });
});

// ============================================================================
// plugin.permissions(...keys) — owner-prefixed, never core permissions
// ============================================================================

describe('plugin permissions (via definePlugin)', () => {
    const plugin = definePlugin({
        package: '@astromech/redirects',
        permissions: definePermissions({
            lookup: { label: 'Look up a redirect' },
            generate: { label: 'Generate redirects' },
        }),
    });

    it('prefixes every declared key with plugin:{ns}:', () => {
        expect(plugin.permissions('lookup')).toEqual(['plugin:redirects:lookup']);
    });

    it('returns selected keys in the order given', () => {
        expect(plugin.permissions('generate', 'lookup')).toEqual([
            'plugin:redirects:generate',
            'plugin:redirects:lookup',
        ]);
    });

    it('throws when no key is given', () => {
        expect(() => plugin.permissions()).toThrow(/at least one permission key/);
    });

    it('throws on an unknown key', () => {
        // @ts-expect-error — unknown permission key is rejected at the type level
        expect(() => plugin.permissions('nope')).toThrow(/Unknown permission "nope"/);
    });

    it('composes with builtInRole into a working role', () => {
        const permissions = [
            ...builtInRole('editor'),
            ...plugin.permissions('lookup'),
            // Entry permissions are derived, not declared by the plugin.
            ...entryPermissions('redirects/redirect', 'read', 'update'),
        ] as Permission[];
        expect(hasPermission(permissions, 'entry:posts:publish')).toBe(true);
        expect(hasPermission(permissions, 'plugin:redirects:entry:redirect:read')).toBe(
            true
        );
        expect(hasPermission(permissions, 'plugin:redirects:lookup')).toBe(true);
        expect(hasPermission(permissions, 'users:read')).toBe(false);
        expect(hasPermission(permissions, 'plugin:seo:view')).toBe(false);
    });
});

// ============================================================================
// buildPermissionCatalogue — core + derived entry + plugin permissions
// ============================================================================

describe('buildPermissionCatalogue', () => {
    const driver: DatabaseDriver = {
        type: 'test',
        getInstance() {
            throw new Error('not called');
        },
        createDialect() {
            throw new Error('not called');
        },
    };

    const storageDriver: StorageDriver = {
        name: 'noop',
        async put() {
            return undefined;
        },
        async get() {
            return null;
        },
        async stat() {
            return null;
        },
        async delete() {
            return undefined;
        },
        async list() {
            return { keys: [] };
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
    });
    const pluginDefinition = catalogued();

    const resolved = resolveConfig({
        db: driver,
        storage: storageDriver,
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
        },
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

    it('omits publish for a type without versioning', () => {
        expect(find('entry:posts:publish')).toBeDefined();
        expect(find('entry:pages:publish')).toBeUndefined();
        expect(find('plugin:redirects:entry:redirect:publish')).toBeUndefined();
    });

    it('namespaces a plugin declaration', () => {
        const entry = find('plugin:redirects:lookup');
        expect(entry?.source).toBe('plugin');
        expect(entry?.label).toBe('Look up a redirect');
        expect(entry?.description).toBe('Resolve a path against the redirect table.');
        expect(entry?.owner).toBe('redirects');
    });

    it('sorts by source group, then by permission string within the group', () => {
        const order = ['core', 'entry', 'plugin'];
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
