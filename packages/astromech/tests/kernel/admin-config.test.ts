import { describe, expect, it } from 'vitest';
import { buildAdminConfig, toAdminEntryType } from '@/kernel/admin-config.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    EntryTypeConfig,
    PluginDefinition,
    StorageDriver,
} from '@/types/index.js';

const driver: DatabaseDriver = {
    type: 'test',
    getInstance() {
        throw new Error('not called');
    },
};

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return [];
    },
};

const entryType = (single: string): EntryTypeConfig => ({
    single,
    plural: `${single}s`,
    fields: [{ name: 'body', type: 'text' }],
});

const baseConfig = (
    plugins: PluginDefinition[] = [],
    extra: Partial<AstromechConfig> = {}
): AstromechConfig => ({
    db: driver,
    storage: storageDriver,
    entries: { post: entryType('Post') },
    plugins,
    ...extra,
});

describe('toAdminEntryType', () => {
    it('maps required fields correctly', () => {
        const resolved = resolveConfig(baseConfig());
        const postEntry = resolved.entries['post'];
        if (!postEntry) throw new Error('post entry not resolved');

        const admin = toAdminEntryType(postEntry);

        expect(admin.single).toBe('Post');
        expect(admin.plural).toBe('Posts');
        expect(admin.versioning).toBe(false);
        expect(admin.translatable).toBe(false);
        expect(admin.slug).toBeNull();
        expect(admin.adminColumns).toEqual([]);
        expect(admin.fields).toBeDefined();
        expect(admin.url).toBeNull();
        expect(admin.capabilities).toBeDefined();
        expect(admin.titleField).toBe('title');
    });

    it('omits icon when absent', () => {
        const resolved = resolveConfig(baseConfig());
        const postEntry = resolved.entries['post'];
        if (!postEntry) throw new Error('post entry not resolved');

        const admin = toAdminEntryType(postEntry);

        expect('icon' in admin).toBe(false);
    });

    it('includes icon when present', () => {
        const resolved = resolveConfig({
            ...baseConfig(),
            entries: {
                post: { ...entryType('Post'), icon: 'FileText' },
            },
        });
        const postEntry = resolved.entries['post'];
        if (!postEntry) throw new Error('post entry not resolved');

        const admin = toAdminEntryType(postEntry);

        expect(admin.icon).toBe('FileText');
    });

    it('omits views, defaultView, gridFields, search when absent', () => {
        const resolved = resolveConfig(baseConfig());
        const postEntry = resolved.entries['post'];
        if (!postEntry) throw new Error('post entry not resolved');

        const admin = toAdminEntryType(postEntry);

        expect('views' in admin).toBe(false);
        expect('defaultView' in admin).toBe(false);
        expect('gridFields' in admin).toBe(false);
        expect('search' in admin).toBe(false);
    });
});

describe('buildAdminConfig', () => {
    it('produces correct adminRoute, apiRoute, locales, defaultLocale', () => {
        const config = baseConfig([], {
            adminRoute: '/cms',
            apiRoute: '/cms-api',
            locales: ['en', 'fr'],
            defaultLocale: 'en',
        });
        const resolved = resolveConfig(config);
        const adminConfig = buildAdminConfig(config, resolved);

        expect(adminConfig.adminRoute).toBe('/cms');
        expect(adminConfig.apiRoute).toBe('/cms-api');
        expect(adminConfig.locales).toEqual(['en', 'fr']);
        expect(adminConfig.defaultLocale).toBe('en');
    });

    it('defaults locales to [] and defaultLocale to "en" when absent', () => {
        const config = baseConfig();
        const resolved = resolveConfig(config);
        const adminConfig = buildAdminConfig(config, resolved);

        expect(adminConfig.locales).toEqual([]);
        expect(adminConfig.defaultLocale).toBe('en');
    });

    it('produces roles array with slug and name', () => {
        const config = baseConfig([], {
            roles: {
                editor: { name: 'Editor', permissions: ['admin:access'] },
            },
        });
        const resolved = resolveConfig(config);
        const adminConfig = buildAdminConfig(config, resolved);

        const slugs = adminConfig.roles.map((r) => r.slug);
        expect(slugs).toContain('editor');
        expect(slugs).toContain('admin'); // built-in
        const editorRole = adminConfig.roles.find((r) => r.slug === 'editor');
        expect(editorRole?.name).toBe('Editor');
    });

    it('produces root entries with the admin shape', () => {
        const config = baseConfig();
        const resolved = resolveConfig(config);
        const adminConfig = buildAdminConfig(config, resolved);

        const post = adminConfig.entries['post'];
        expect(post).toBeDefined();
        expect(post?.single).toBe('Post');
        expect(post?.plural).toBe('Posts');
        expect(post?.versioning).toBe(false);
        expect(post?.translatable).toBe(false);
        expect(post?.slug).toBeNull();
        expect(Array.isArray(post?.adminColumns)).toBe(true);
        expect(post?.capabilities).toBeDefined();
        expect(post?.titleField).toBe('title');
    });

    it('produces plugin metadata with name, label, permissionNamespace, nav, entries, pages', () => {
        const config = baseConfig([
            {
                package: '@astromech/seo',
                entries: [{ ...entryType('Redirect'), type: 'redirect' }],
                admin: {
                    pages: [
                        {
                            path: '/overview',
                            label: 'Overview',
                            fields: [{ name: 'title', type: 'text' }],
                        },
                    ],
                },
            },
        ]);
        const resolved = resolveConfig(config);
        const adminConfig = buildAdminConfig(config, resolved);

        expect(adminConfig.plugins).toHaveLength(1);
        const plugin = adminConfig.plugins[0];
        expect(plugin?.name).toBe('seo');
        expect(plugin?.label).toBe('Seo');
        expect(plugin?.permissionNamespace).toBe('astromech-seo');
        expect(Array.isArray(plugin?.nav)).toBe(true);
        expect(plugin?.entries['redirect']).toBeDefined();
        expect(plugin?.pages).toHaveLength(1);
    });
});
