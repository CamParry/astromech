import { describe, expect, it } from 'vitest';
import type { Permission, Role } from '@/types/index.js';
import {
    hasPermission,
    can,
    builtInRole,
    definePermissionBundles,
    BUILT_IN_ROLES,
    resolveRoles,
} from '@/permissions/index.js';

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
                hasPermission(
                    ['entry:*'],
                    'plugin:astromech-redirects:entry:redirect:read'
                )
            ).toBe(false);
        });
    });

    describe('plugin tree', () => {
        it('per-plugin wildcard grants own keys, including deep paths', () => {
            const granted = ['plugin:astromech-redirects:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:astromech-redirects:lookup')).toBe(
                true
            );
            expect(
                hasPermission(granted, 'plugin:astromech-redirects:entry:redirect:read')
            ).toBe(true);
        });

        it('per-plugin wildcard does not grant sibling plugin', () => {
            const granted = ['plugin:astromech-redirects:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:astromech-seo:write')).toBe(false);
        });

        it('plugin:* grants all plugin permissions', () => {
            const granted = ['plugin:*'] as Permission[];
            expect(hasPermission(granted, 'plugin:astromech-redirects:lookup')).toBe(
                true
            );
            expect(hasPermission(granted, 'plugin:astromech-seo:write')).toBe(true);
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
            expect(hasPermission(['*'], 'plugin:astromech-seo:view')).toBe(true);
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
            expect(can(editorRole, 'plugin:astromech-seo:view' as Permission)).toBe(
                false
            );
        });
    });

    describe('admin role', () => {
        it('grants everything via * wildcard', () => {
            expect(can(adminRole, 'entry:posts:publish')).toBe(true);
            expect(can(adminRole, 'users:delete')).toBe(true);
            expect(can(adminRole, 'settings:update')).toBe(true);
            expect(can(adminRole, 'plugin:astromech-seo:view' as Permission)).toBe(true);
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
// definePermissionBundles — owner-prefixed bundles, never core permissions
// ============================================================================

describe('definePermissionBundles', () => {
    const bundle = definePermissionBundles('@astromech/redirects', {
        manage: ['entry:redirect:*', 'lookup'],
        view: ['entry:redirect:read'],
    });

    it('prefixes every key with plugin:{ns}: — including nested keys', () => {
        expect(bundle('manage')).toEqual([
            'plugin:astromech-redirects:entry:redirect:*',
            'plugin:astromech-redirects:lookup',
        ]);
    });

    it('throws on an unknown bundle name', () => {
        // @ts-expect-error — unknown bundle name is rejected at the type level
        expect(() => bundle('nope')).toThrow(/Unknown permission bundle/);
    });

    it('composes with builtInRole into a working role', () => {
        const permissions = [...builtInRole('editor'), ...bundle('manage')];
        expect(hasPermission(permissions, 'entry:posts:publish')).toBe(true);
        expect(
            hasPermission(permissions, 'plugin:astromech-redirects:entry:redirect:read')
        ).toBe(true);
        expect(hasPermission(permissions, 'plugin:astromech-redirects:lookup')).toBe(
            true
        );
        expect(hasPermission(permissions, 'users:read')).toBe(false);
        expect(hasPermission(permissions, 'plugin:astromech-seo:view')).toBe(false);
    });
});
