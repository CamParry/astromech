import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/core/config-resolver.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    EntryTypeConfig,
    PluginDefinition,
    StorageDriver,
} from '@/types/index.js';
import type { EntryStorage } from '@/core/entry-storage/types.js';
import { text } from '@/builders/fields.js';

const driver: DatabaseDriver = {
    type: 'test',
    getInstance() {
        throw new Error('not called');
    },
};

const storageDriver: StorageDriver = {
    name: 'noop',
    upload: async () => '',
    delete: async () => undefined,
    getUrl: () => '',
};

const entryType = (single: string): EntryTypeConfig => ({
    single,
    plural: `${single}s`,
    fieldGroups: [
        {
            name: 'main',
            label: 'Main',
            placement: 'main',
            fields: [{ name: 'body', type: 'text' }],
        },
    ],
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
                    entries: { redirect: entryType('Redirect') },
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
                    entries: { redirect: entryType('Redirect') },
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
                    entries: {
                        item: { ...entryType('Item'), storage: emptyStorage() },
                    },
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
                        entries: {
                            item: {
                                ...entryType('Item'),
                                versioning: true,
                                storage: emptyStorage(),
                            },
                        },
                    },
                ])
            )
        ).toThrow(/store\/item/);
    });
});

describe('resolveConfig flat fields shortcut', () => {
    const flatConfig = (extra: Partial<EntryTypeConfig> = {}): AstromechConfig => ({
        db: driver,
        storage: storageDriver,
        entries: {
            post: {
                single: 'Post',
                plural: 'Posts',
                fields: [
                    text('from').required().build(),
                    text('to').searchable().build(),
                ],
                ...extra,
            },
        },
        plugins: [],
    });

    it('synthesizes one main group from flat fields', () => {
        const resolved = resolveConfig(flatConfig());
        const groups = resolved.entries['post']?.fieldGroups;
        expect(groups).toHaveLength(1);
        const group0 = groups?.[0];
        expect(group0?.name).toBe('main');
        expect(group0?.fields).toHaveLength(2);
        expect(group0?.fields[0]?.name).toBe('from');
        expect(group0?.fields[0]?.required).toBe(true);
    });

    it('fields in the resolved group are plain objects (no builder methods)', () => {
        const resolved = resolveConfig(flatConfig());
        const field = resolved.entries['post']?.fieldGroups[0]?.fields[0] as
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

    it('throws when both fields and fieldGroups are provided', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [text('x').build()],
                        fieldGroups: [
                            {
                                name: 'main',
                                label: 'Main',
                                placement: 'main',
                                fields: [],
                            },
                        ],
                    },
                },
                plugins: [],
            })
        ).toThrow(/post/);
    });
});

describe('resolveConfig qualified relationship targets', () => {
    const withTarget = (target: string): EntryTypeConfig => ({
        single: 'Linker',
        plural: 'Linkers',
        fieldGroups: [
            {
                name: 'rel',
                label: 'Rel',
                placement: 'main',
                fields: [{ name: 'ref', type: 'relationship', target }],
            },
        ],
    });

    it('passes when a qualified target resolves', () => {
        expect(() =>
            resolveConfig(
                baseConfig([
                    {
                        package: '@astromech/store',
                        entries: {
                            item: entryType('Item'),
                            linker: withTarget('store/item'),
                        },
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
                        entries: { linker: withTarget('store/missing') },
                    },
                ])
            )
        ).toThrow(/store\/missing/);
    });
});
