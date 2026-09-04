/**
 * `resolveAccess` — the one reader of a method's declared `access`, over each
 * of the five forms it can take.
 */

import type { Permission } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { resolveAccess } from '@/permissions/access';

describe('resolveAccess', () => {
    it('answers public for the public form', () => {
        expect(resolveAccess('public', undefined)).toEqual({ kind: 'public' });
    });

    it('answers authenticated for the authenticated form', () => {
        expect(resolveAccess('authenticated', undefined)).toEqual({
            kind: 'authenticated',
        });
    });

    it('answers the permission for a bare core permission', () => {
        expect(resolveAccess('settings:read', undefined)).toEqual({
            kind: 'permission',
            permission: 'settings:read',
        });
    });

    it('answers the permission the function form derives from the input', () => {
        const access = (input: { key: string }): Permission => `${input.key}:read`;

        expect(resolveAccess(access, { key: 'settings' })).toEqual({
            kind: 'permission',
            permission: 'settings:read',
        });
    });

    it('answers public when the function form derives no permission', () => {
        expect(resolveAccess(() => null, { key: 'site' })).toEqual({ kind: 'public' });
    });

    it('resolves the object form under the plugin namespace it is given', () => {
        expect(resolveAccess({ permission: 'view' }, undefined, 'seo')).toEqual({
            kind: 'permission',
            permission: 'plugin:seo:view',
        });
    });

    it('passes a namespaced key in the object form through unchanged', () => {
        expect(resolveAccess({ permission: 'settings:read' }, undefined, 'seo')).toEqual({
            kind: 'permission',
            permission: 'settings:read',
        });
    });

    it('refuses the object form with no namespace to resolve it under', () => {
        expect(() => resolveAccess({ permission: 'view' }, undefined)).toThrow(
            'cannot resolve the access'
        );
    });
});
