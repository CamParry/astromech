import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/kernel/config-resolver.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    EntryTypeConfig,
    PluginDefinition,
    StorageDriver,
} from '@/types/index.js';
import type { EntryStorage } from '@/entries/storage/types.js';

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

const baseConfig = (plugins: PluginDefinition[]): AstromechConfig => ({
    db: driver,
    storage: storageDriver,
    entries: { post: entryType('Post') },
    plugins,
});

/** A storage that supports nothing (Phase 3 minimal single-table style). */
const emptyStorage = (): EntryStorage => ({
    supports: [],
    list: async () => ({ data: [], total: 0 }),
    get: async () => null,
    create: async () => {
        throw new Error('not called');
    },
    update: async () => {
        throw new Error('not called');
    },
    delete: async () => undefined,
    uniqueSlug: async () => '',
});

describe('resolveConfig pluginEntries', () => {
    it('resolves plugin entry types into the namespaced map (not root entries)', () => {
        const resolved = resolveConfig(
            baseConfig([
                {
                    package: '@astromech/redirects',
                    entries: [{ ...entryType('Redirect'), type: 'redirect' }],
                },
            ])
        );

        expect(resolved.entries.redirect).toBeUndefined();
        expect(resolved.pluginEntries.redirects?.redirect).toBeDefined();
        expect(resolved.pluginEntries.redirects?.redirect?.capabilities).toBeDefined();
        expect(resolved.pluginEntries.redirects?.redirect?.titleField).toBe('title');
    });

    it('keys pluginEntries by resolved plugin name (alias override)', () => {
        const resolved = resolveConfig(
            baseConfig([
                {
                    package: '@astromech/redirects',
                    alias: 'links',
                    entries: [{ ...entryType('Redirect'), type: 'redirect' }],
                },
            ])
        );

        expect(resolved.pluginEntries.links?.redirect).toBeDefined();
        expect(resolved.pluginEntries.redirects).toBeUndefined();
    });

    it('always present even with no plugins', () => {
        const resolved = resolveConfig(baseConfig([]));
        expect(resolved.pluginEntries).toEqual({});
    });

    it('strips the live storage instance so the whole config is JSON-serialisable', () => {
        const resolved = resolveConfig(
            baseConfig([
                {
                    package: '@astromech/store',
                    entries: [
                        { ...entryType('Item'), type: 'item', storage: emptyStorage() },
                    ],
                },
            ])
        );

        const item = resolved.pluginEntries.store?.item as Record<string, unknown>;
        expect('storage' in item).toBe(false);
        expect(() => JSON.stringify(resolved)).not.toThrow();
    });

    it('crashes with the qualified key when capabilities exceed storage support', () => {
        expect(() =>
            resolveConfig(
                baseConfig([
                    {
                        package: '@astromech/store',
                        entries: [
                            {
                                ...entryType('Item'),
                                type: 'item',
                                versioning: true,
                                storage: emptyStorage(),
                            },
                        ],
                    },
                ])
            )
        ).toThrow(/store\/item/);
    });
});

describe('resolveConfig flat fields', () => {
    const flatConfig = (extra: Partial<EntryTypeConfig> = {}): AstromechConfig => ({
        db: driver,
        storage: storageDriver,
        entries: {
            post: {
                single: 'Post',
                plural: 'Posts',
                fields: [
                    { name: 'from', type: 'text', required: true },
                    { name: 'to', type: 'text', searchable: true },
                ],
                ...extra,
            },
        },
        plugins: [],
    });

    it('resolves a flat fields array to { main, sidebar: [] }', () => {
        const resolved = resolveConfig(flatConfig());
        expect(resolved.entries['post']?.fields.main).toHaveLength(2);
        expect(resolved.entries['post']?.fields.sidebar).toEqual([]);
        expect(resolved.entries['post']?.fields.main[0]?.name).toBe('from');
    });

    it('fields in resolved are plain objects', () => {
        const resolved = resolveConfig(flatConfig());
        const field = resolved.entries['post']?.fields.main[0] as
            | Record<string, unknown>
            | undefined;
        expect(typeof field?.['build']).toBe('undefined');
    });

    it('derives search from searchable fields', () => {
        const resolved = resolveConfig(flatConfig());
        expect(resolved.entries.post?.search).toEqual(['to']);
    });

    it('explicit search wins over derived', () => {
        const resolved = resolveConfig(flatConfig({ search: ['from'] }));
        expect(resolved.entries.post?.search).toEqual(['from']);
    });
});

describe('resolveConfig { main, sidebar } fields shape', () => {
    it('resolves a { main, sidebar } shape through unchanged', () => {
        const resolved = resolveConfig({
            db: driver,
            storage: storageDriver,
            entries: {
                post: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: {
                        main: [{ name: 'body', type: 'text' }],
                        sidebar: [{ name: 'author', type: 'text' }],
                    },
                },
            },
            plugins: [],
        });
        expect(resolved.entries['post']?.fields.main).toHaveLength(1);
        expect(resolved.entries['post']?.fields.sidebar).toHaveLength(1);
        expect(resolved.entries['post']?.fields.main[0]?.name).toBe('body');
        expect(resolved.entries['post']?.fields.sidebar[0]?.name).toBe('author');
    });

    it('sidebar defaults to [] when omitted from { main } shape', () => {
        const resolved = resolveConfig({
            db: driver,
            storage: storageDriver,
            entries: {
                post: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: { main: [{ name: 'body', type: 'text' }] },
                },
            },
            plugins: [],
        });
        expect(resolved.entries['post']?.fields.sidebar).toEqual([]);
    });
});

describe('resolveConfig undefined fields', () => {
    it('resolves to empty { main: [], sidebar: [] } when fields is absent', () => {
        const resolved = resolveConfig({
            db: driver,
            storage: storageDriver,
            entries: {
                post: { single: 'Post', plural: 'Posts' },
            },
            plugins: [],
        });
        expect(resolved.entries['post']?.fields).toEqual({ main: [], sidebar: [] });
    });
});

describe('resolveConfig structural validation', () => {
    it('throws when a tab appears outside of tabs', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [{ name: 'bad', type: 'tab', fields: [] }],
                    },
                },
                plugins: [],
            })
        ).toThrow(/post.*tab.*must be a direct child of `tabs`/);
    });

    it('throws when tabs contains a non-tab child', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [
                            {
                                name: 'myTabs',
                                type: 'tabs',
                                fields: [{ name: 'oops', type: 'text' }],
                            },
                        ],
                    },
                },
                plugins: [],
            })
        ).toThrow(/post.*tabs.*may only contain.*tab.*children/);
    });
});

describe('resolveConfig timezone', () => {
    it('defaults timezone to "UTC" when not specified', () => {
        const resolved = resolveConfig(baseConfig([]));
        expect(resolved.timezone).toBe('UTC');
    });

    it('respects an explicit timezone', () => {
        const resolved = resolveConfig({
            ...baseConfig([]),
            timezone: 'America/New_York',
        });
        expect(resolved.timezone).toBe('America/New_York');
    });
});

describe('resolveConfig qualified relationship targets', () => {
    const withTarget = (target: string): EntryTypeConfig => ({
        single: 'Linker',
        plural: 'Linkers',
        fields: [{ name: 'ref', type: 'relationship', target }],
    });

    it('passes when a qualified target resolves', () => {
        expect(() =>
            resolveConfig(
                baseConfig([
                    {
                        package: '@astromech/store',
                        entries: [
                            { ...entryType('Item'), type: 'item' },
                            { ...withTarget('store/item'), type: 'linker' },
                        ],
                    },
                ])
            )
        ).not.toThrow();
    });

    it('crashes when a qualified target is unknown', () => {
        expect(() =>
            resolveConfig(
                baseConfig([
                    {
                        package: '@astromech/store',
                        entries: [{ ...withTarget('store/missing'), type: 'linker' }],
                    },
                ])
            )
        ).toThrow(/store\/missing/);
    });
});
