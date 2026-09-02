import type { GlobalAction } from '@/permissions/global-permission';
import { describe, expect, it } from 'vitest';
import {
    globalPermission,
    globalPermissions,
    pluginGlobalPermission,
    rootGlobalPermission,
} from '@/permissions/global-permission';
import { hasPermission } from '@/utilities/permission-match';

const ACTIONS: GlobalAction[] = ['read', 'update', 'publish'];

describe('rootGlobalPermission', () => {
    it('should return global:<key>:<action>', () => {
        expect(rootGlobalPermission('site', 'read')).toBe('global:site:read');
    });

    it('should work for all GlobalAction values', () => {
        for (const action of ACTIONS) {
            expect(rootGlobalPermission('site', action)).toBe(`global:site:${action}`);
        }
    });

    it('should use the exact key string without transformation', () => {
        expect(rootGlobalPermission('site-settings', 'update')).toBe(
            'global:site-settings:update'
        );
    });
});

describe('pluginGlobalPermission', () => {
    it('should return plugin:<ns>:global:<key>:<action>', () => {
        expect(pluginGlobalPermission('seo', 'settings', 'read')).toBe(
            'plugin:seo:global:settings:read'
        );
    });

    it('should work for all GlobalAction values', () => {
        for (const action of ACTIONS) {
            expect(pluginGlobalPermission('my-ns', 'widget', action)).toBe(
                `plugin:my-ns:global:widget:${action}`
            );
        }
    });
});

describe('globalPermission — derivation from the global id', () => {
    it('derives the host form from a bare id', () => {
        expect(globalPermission('site', 'read')).toBe('global:site:read');
    });

    it('derives the plugin form from a qualified id', () => {
        expect(globalPermission('seo/settings', 'update')).toBe(
            'plugin:seo:global:settings:update'
        );
    });

    it('splits on the FIRST separator only', () => {
        expect(globalPermission('shop/checkout/copy', 'update')).toBe(
            'plugin:shop:global:checkout/copy:update'
        );
    });

    it('keeps plugin globals OUT of the global:* wildcard', () => {
        const editor = ['global:*'];
        expect(hasPermission(editor, globalPermission('site', 'update'))).toBe(true);
        expect(hasPermission(editor, globalPermission('seo/settings', 'read'))).toBe(
            false
        );
    });

    it('is satisfied by the matching plugin grant', () => {
        const granted = ['plugin:seo:global:settings:*'];
        expect(hasPermission(granted, globalPermission('seo/settings', 'publish'))).toBe(
            true
        );
        expect(hasPermission(granted, globalPermission('site', 'read'))).toBe(false);
    });
});

describe('globalPermissions', () => {
    it('maps every action through the derivation', () => {
        expect(globalPermissions('site', 'read', 'update')).toEqual([
            'global:site:read',
            'global:site:update',
        ]);
        expect(globalPermissions('seo/settings', 'read')).toEqual([
            'plugin:seo:global:settings:read',
        ]);
    });

    it('throws when no action is passed', () => {
        expect(() => globalPermissions('site')).toThrow(/needs at least one action/);
    });
});
