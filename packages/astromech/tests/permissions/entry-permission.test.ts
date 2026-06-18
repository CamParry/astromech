import { describe, expect, it } from 'vitest';
import {
    rootEntryPermission,
    pluginEntryPermission,
    type EntryAction,
} from '@/permissions/entry-permission.js';

describe('rootEntryPermission', () => {
    it('should return entry:<type>:<action>', () => {
        expect(rootEntryPermission('posts', 'read')).toBe('entry:posts:read');
    });

    it('should work for all EntryAction values', () => {
        const actions: EntryAction[] = ['read', 'create', 'update', 'delete', 'publish'];
        for (const action of actions) {
            expect(rootEntryPermission('posts', action)).toBe(`entry:posts:${action}`);
        }
    });

    it('should use the exact type string without transformation', () => {
        expect(rootEntryPermission('blog-posts', 'create')).toBe(
            'entry:blog-posts:create'
        );
    });
});

describe('pluginEntryPermission', () => {
    it('should return plugin:<ns>:entry:<type>:<action>', () => {
        expect(pluginEntryPermission('astromech-redirects', 'redirect', 'read')).toBe(
            'plugin:astromech-redirects:entry:redirect:read'
        );
    });

    it('should work for all EntryAction values', () => {
        const actions: EntryAction[] = ['read', 'create', 'update', 'delete', 'publish'];
        for (const action of actions) {
            expect(pluginEntryPermission('my-ns', 'widget', action)).toBe(
                `plugin:my-ns:entry:widget:${action}`
            );
        }
    });

    it('should use the exact permissionNamespace string', () => {
        expect(pluginEntryPermission('custom-ns', 'product', 'delete')).toBe(
            'plugin:custom-ns:entry:product:delete'
        );
    });
});
