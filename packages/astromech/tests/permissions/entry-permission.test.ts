import type { EntryAction } from '@/permissions/entry-permission';
import { describe, expect, it } from 'vitest';
import {
    entryPermission,
    pluginEntryPermission,
    rootEntryPermission,
} from '@/permissions/entry-permission';
import { hasPermission } from '@/utilities/permission-match';

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
        expect(pluginEntryPermission('redirects', 'redirect', 'read')).toBe(
            'plugin:redirects:entry:redirect:read'
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

describe('entryPermission — derivation from the type id', () => {
    it('derives the root form from a bare type id', () => {
        expect(entryPermission('post', 'read')).toBe('entry:post:read');
        expect(entryPermission('blog-posts', 'create')).toBe('entry:blog-posts:create');
    });

    it('derives the plugin form from a qualified type id', () => {
        expect(entryPermission('redirects/redirect', 'read')).toBe(
            'plugin:redirects:entry:redirect:read'
        );
        expect(entryPermission('widgets/widget', 'delete')).toBe(
            'plugin:widgets:entry:widget:delete'
        );
    });

    it('splits on the FIRST separator only, so a type may contain one', () => {
        expect(entryPermission('shop/catalog/product', 'update')).toBe(
            'plugin:shop:entry:catalog/product:update'
        );
    });

    it('covers every action in both forms', () => {
        const actions: EntryAction[] = ['read', 'create', 'update', 'delete', 'publish'];
        for (const action of actions) {
            expect(entryPermission('post', action)).toBe(`entry:post:${action}`);
            expect(entryPermission('widgets/widget', action)).toBe(
                `plugin:widgets:entry:widget:${action}`
            );
        }
    });

    it('keeps plugin entries OUT of the entry:* wildcard', () => {
        // The whole point of the derivation: one entries router serves both, so
        // an `editor` holding `entry:*` must not thereby reach plugin entries.
        const editor = ['entry:*'];
        expect(hasPermission(editor, entryPermission('post', 'delete'))).toBe(true);
        expect(hasPermission(editor, entryPermission('widgets/widget', 'read'))).toBe(
            false
        );
        expect(hasPermission(editor, entryPermission('widgets/widget', 'delete'))).toBe(
            false
        );
    });

    it('is satisfied by the matching plugin grant', () => {
        const granted = ['plugin:widgets:entry:widget:*'];
        expect(hasPermission(granted, entryPermission('widgets/widget', 'read'))).toBe(
            true
        );
        expect(hasPermission(granted, entryPermission('post', 'read'))).toBe(false);
    });
});
