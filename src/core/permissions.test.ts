import { describe, expect, it } from 'vitest';
import type { Permission } from '@/types/index.js';
import { hasPermission } from '@/core/permissions.js';

describe('hasPermission', () => {
    it('grants on global wildcard and exact match', () => {
        expect(hasPermission(['*'], 'entry:read:posts')).toBe(true);
        expect(hasPermission(['entry:read:posts'], 'entry:read:posts')).toBe(true);
        expect(hasPermission(['entry:read:posts'], 'entry:read:pages')).toBe(false);
    });

    it('grants on a three-part scope wildcard', () => {
        expect(hasPermission(['entry:read:*'], 'entry:read:posts')).toBe(true);
        expect(hasPermission(['entry:read:*'], 'entry:update:posts')).toBe(false);
    });

    describe('plugin permissions', () => {
        const lookup = 'plugin:astromech-redirects:lookup' as Permission;

        it('grants on exact plugin permission', () => {
            expect(hasPermission([lookup], lookup)).toBe(true);
        });

        it('grants on per-plugin wildcard (plugin:<pkg>:*)', () => {
            expect(hasPermission(['plugin:astromech-redirects:*' as Permission], lookup)).toBe(true);
            expect(
                hasPermission(['plugin:astromech-seo:*' as Permission], lookup)
            ).toBe(false);
        });

        it('grants on the plugin-wide wildcard (plugin:*)', () => {
            expect(hasPermission(['plugin:*' as Permission], lookup)).toBe(true);
            expect(
                hasPermission(['plugin:*' as Permission], 'plugin:astromech-seo:write' as Permission)
            ).toBe(true);
        });

        it('does not let plugin:* leak into non-plugin permissions', () => {
            expect(hasPermission(['plugin:*' as Permission], 'entry:read:posts')).toBe(false);
        });
    });
});
