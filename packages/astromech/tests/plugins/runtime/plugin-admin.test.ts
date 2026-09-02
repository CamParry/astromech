import type {
    AdminPage,
    EntryType,
    PluginDefinition,
    PluginNavItem,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { derivePluginNav, derivePluginPages } from '@/plugins/runtime/plugin-admin';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

const entryType = (type: string, single: string, plural: string): EntryType => ({
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
                permission: 'plugin:redirects:entry:redirect:read',
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

describe('derivePluginPages — unified ResolvedAdminPage', () => {
    const componentPlugin = (path: string, extra: Partial<AdminPage> = {}) =>
        ({
            package: 'widgets',
            admin: {
                pages: [
                    { path, label: 'Overview', component: './overview.js', ...extra },
                ],
            },
        }) satisfies PluginDefinition;

    it('produces key as name+path', () => {
        const plugin: PluginDefinition = {
            package: '@astromech/seo',
            admin: {
                pages: [
                    { path: '/overview', label: 'Overview', component: './overview.js' },
                ],
            },
        };
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.key).toBe('seo/overview');
    });

    it('sets componentKey to the namespaced key', () => {
        const plugin = componentPlugin('/overview');
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.componentKey).toBe('widgets/overview');
    });

    it('defaults permission to null', () => {
        const plugin = componentPlugin('/overview');
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.permission).toBeNull();
    });

    it('namespaces a bare permission', () => {
        const plugin = componentPlugin('/overview', { permission: 'view' });
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.permission).toBe('plugin:widgets:view');
    });

    it('defaults nav to true and respects nav: false', () => {
        const identity = resolvePluginIdentity(componentPlugin('/overview'));
        expect(derivePluginPages(identity, componentPlugin('/overview'))[0]?.nav).toBe(
            true
        );
        expect(
            derivePluginPages(identity, componentPlugin('/overview', { nav: false }))[0]
                ?.nav
        ).toBe(false);
    });
});
