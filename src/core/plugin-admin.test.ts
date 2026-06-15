import { describe, expect, it } from 'vitest';
import type { EntryTypeConfig, PluginDefinition, PluginNavItem } from '@/types/index.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';
import { derivePluginNav, derivePluginPages } from '@/core/plugin-admin.js';

const entryType = (type: string, single: string, plural: string): EntryTypeConfig => ({
    type,
    single,
    plural,
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
            entries: [entryType('redirect', 'Redirect', 'Redirects')],
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.label).toBe('Redirects');
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
            entries: [entryType('redirect', 'Redirect', 'Redirects')],
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
            entries: [entryType('gadget', 'Gadget', 'Gadgets')],
        });
        expect(kids[0]?.label).toBe('Gadgets');
    });

    it('returns no group when the plugin has no entries and no nav pages', () => {
        expect(nav({ package: 'empty' })).toEqual([]);
    });

    it('builds a group from entry types alone (no pages)', () => {
        const result = nav({
            package: 'widgets',
            entries: [entryType('gadget', 'Gadget', 'Gadgets')],
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.children).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// derivePluginPages — unified ResolvedAdminPage
// ---------------------------------------------------------------------------

describe('derivePluginPages — unified ResolvedAdminPage', () => {
    it('produces namespaced baseKey for settings pages', () => {
        const plugin: PluginDefinition = {
            package: '@astromech/seo',
            admin: {
                pages: [{ path: '/settings', label: 'Settings', fields: [{ name: 'x', type: 'text' }] }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.baseKey).toBe('plugin:astromech-seo:/settings');
    });

    it('produces key as name+path', () => {
        const plugin: PluginDefinition = {
            package: '@astromech/seo',
            admin: {
                pages: [{ path: '/settings', label: 'Settings', fields: [{ name: 'x', type: 'text' }] }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.key).toBe('seo/settings');
    });

    it('sets fields to resolved tree and componentKey null for settings pages', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{ path: '/cfg', label: 'Config', fields: [{ name: 'x', type: 'text' }] }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.fields).not.toBeNull();
        expect(pages[0]?.componentKey).toBeNull();
    });

    it('sets componentKey for component pages and fields null', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{ path: '/overview', label: 'Overview', component: './overview.js' }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.componentKey).toBe('widgets/overview');
        expect(pages[0]?.fields).toBeNull();
    });

    it('defaults permission to settings:read for fields-mode pages', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{ path: '/cfg', label: 'Config', fields: [{ name: 'x', type: 'text' }] }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.permission).toBe('settings:read');
    });

    it('defaults permission to null for component pages', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{ path: '/overview', label: 'Overview', component: './overview.js' }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.permission).toBeNull();
    });

    it('throws when neither fields nor component is provided', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{ path: '/bad', label: 'Bad' } as import('@/types/index.js').AdminPage],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        expect(() => derivePluginPages(identity, plugin)).toThrow(
            /widgets.*\/bad.*exactly one of/
        );
    });

    it('throws when both fields and component are provided', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{
                    path: '/both',
                    label: 'Both',
                    fields: [{ name: 'x', type: 'text' }],
                    component: './Both.tsx',
                }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        expect(() => derivePluginPages(identity, plugin)).toThrow(
            /widgets.*\/both.*exactly one of/
        );
    });

    it('resolves full EntryFields tree (main + sidebar) for settings pages', () => {
        const plugin: PluginDefinition = {
            package: 'widgets',
            admin: {
                pages: [{
                    path: '/settings',
                    label: 'Settings',
                    fields: {
                        main: [
                            { name: 'mode', type: 'select', options: ['a', 'b'] },
                        ],
                        sidebar: [
                            { name: 'enabled', type: 'boolean' },
                        ],
                    },
                }],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.fields?.main).toHaveLength(1);
        expect(pages[0]?.fields?.sidebar).toHaveLength(1);
        expect(pages[0]?.fields?.main[0]?.name).toBe('mode');
        expect(pages[0]?.fields?.sidebar[0]?.name).toBe('enabled');
    });
});
