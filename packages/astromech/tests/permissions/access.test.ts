/**
 * `resolveAccess` — the one reader of a method's declared `access`, over each
 * of the five forms it can take — and `deniedPermission`, what a refusal names.
 */

import type { Permission } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { deniedPermission, NO_CALLER, resolveAccess } from '@/permissions/access';

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
        expect(resolveAccess('users:read', undefined)).toEqual({
            kind: 'permission',
            permissions: ['users:read'],
        });
    });

    it('answers the permission the function form derives from the input', () => {
        const access = (input: { key: string }): Permission => `${input.key}:read`;

        expect(resolveAccess(access, { key: 'users' })).toEqual({
            kind: 'permission',
            permissions: ['users:read'],
        });
    });

    it('answers public when the function form derives no permission', () => {
        expect(resolveAccess(() => null, { key: 'site' })).toEqual({ kind: 'public' });
    });

    it('resolves the object form under the plugin namespace it is given', () => {
        expect(
            resolveAccess({ permission: 'view' }, undefined, NO_CALLER, 'seo')
        ).toEqual({
            kind: 'permission',
            permissions: ['plugin:seo:view'],
        });
    });

    it('passes a namespaced key in the object form through unchanged', () => {
        expect(
            resolveAccess({ permission: 'users:read' }, undefined, NO_CALLER, 'seo')
        ).toEqual({
            kind: 'permission',
            permissions: ['users:read'],
        });
    });

    it('refuses the object form with no namespace to resolve it under', () => {
        expect(() => resolveAccess({ permission: 'view' }, undefined)).toThrow(
            'cannot resolve the access'
        );
    });
});

describe('deniedPermission', () => {
    const access = {
        kind: 'permission',
        permissions: ['entry:posts:update', 'entry:posts:publish'],
    } as const;

    it('names the first permission the caller lacks, not only the first demanded', () => {
        expect(
            deniedPermission(access, (permission) => permission === 'entry:posts:update')
        ).toBe('entry:posts:publish');
    });

    it('names none when the caller holds every one', () => {
        expect(deniedPermission(access, () => true)).toBeNull();
    });
});
