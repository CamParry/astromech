import { describe, expect, it } from 'vitest';
import type { EntryTypeConfig, PluginDefinition, PluginNavItem } from '@/types/index.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';
import { derivePluginNav } from '@/core/plugin-admin.js';

const entryType = (single: string, plural: string): EntryTypeConfig => ({
    single,
    plural,
    fieldGroups: [],
});

function nav(def: PluginDefinition): PluginNavItem[] {
    return derivePluginNav(resolvePluginIdentity(def), def);
}

function children(def: PluginDefinition): PluginNavItem[] {
    const result = nav(def);
    return result[0]?.children ?? [];
}

describe('derivePluginNav — entry types', () => {
    it('prepends a nav child per entry type, gated on read permission', () => {
        const result = nav({
            package: '@astromech/redirects',
            entries: { redirect: entryType('Redirect', 'Redirects') },
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.label).toBe('redirects');
        expect(result[0]?.children).toEqual([
            {
                label: 'Redirects',
                to: '/plugin/redirects/entries/redirect',
                permission: 'plugin:astromech-redirects:entry:redirect:read',
            },
        ]);
    });

    it('lists entry children before page children', () => {
        const kids = children({
            package: '@astromech/redirects',
            entries: { redirect: entryType('Redirect', 'Redirects') },
            admin: {
                pages: [
                    {
                        path: '/overview',
                        label: 'Overview',
                        component: './overview.js',
                    },
                ],
            },
        });

        expect(kids.map((c) => c.to)).toEqual([
            '/plugin/redirects/entries/redirect',
            '/plugin/redirects/overview',
        ]);
    });

    it('uses the plural as the entry child label', () => {
        const kids = children({
            package: 'widgets',
            entries: { gadget: entryType('Gadget', 'Gadgets') },
        });
        expect(kids[0]?.label).toBe('Gadgets');
    });

    it('returns no group when the plugin has no entries and no nav pages', () => {
        expect(nav({ package: 'empty' })).toEqual([]);
    });

    it('builds a group from entry types alone (no pages)', () => {
        const result = nav({
            package: 'widgets',
            entries: { gadget: entryType('Gadget', 'Gadgets') },
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.children).toHaveLength(1);
    });
});
