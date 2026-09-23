import type { CustomTableRepository } from '@/entries/repository/table';
import type { EntryRepository } from '@/entries/repository/types';
import type {
    AstromechConfig,
    DatabaseDriver,
    EntryType,
    Field,
    PluginDefinition,
    StorageDriver,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { block, blocks, group, repeater, tab, tabs, text, tree } from '@/fields/builder';

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
    async stat() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return { keys: [] };
    },
};

const entryType = (single: string): EntryType => ({
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

/**
 * A repository that supports nothing (minimal single-table style). Structural,
 * so the `repository` assignments cast past the `CustomTableRepository` guard —
 * this suite exercises `resolveConfig`, not the public config surface.
 */
const emptyRepository = (): EntryRepository => ({
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

describe('resolveConfig migrationsDir', () => {
    it('defaults to ./migrations', () => {
        expect(resolveConfig(baseConfig([])).migrationsDir).toBe('./migrations');
    });

    it('keeps the folder the config names', () => {
        const resolved = resolveConfig({
            ...baseConfig([]),
            migrationsDir: './database/migrations',
        });

        expect(resolved.migrationsDir).toBe('./database/migrations');
    });
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

    it('keys pluginEntries by the derived namespace, scope and all', () => {
        const resolved = resolveConfig(
            baseConfig([
                {
                    package: '@acme/redirects',
                    entries: [{ ...entryType('Redirect'), type: 'redirect' }],
                },
            ])
        );

        expect(resolved.pluginEntries.acme_redirects?.redirect).toBeDefined();
        expect(resolved.pluginEntries.redirects).toBeUndefined();
    });

    it('always present even with no plugins', () => {
        const resolved = resolveConfig(baseConfig([]));
        expect(resolved.pluginEntries).toEqual({});
    });

    it('strips the live repository instance so the whole config is JSON-serialisable', () => {
        const resolved = resolveConfig(
            baseConfig([
                {
                    package: '@astromech/store',
                    entries: [
                        {
                            ...entryType('Item'),
                            type: 'item',
                            repository:
                                emptyRepository() as unknown as CustomTableRepository,
                        },
                    ],
                },
            ])
        );

        const item = resolved.pluginEntries.store?.item as Record<string, unknown>;
        expect('repository' in item).toBe(false);
        expect(() => JSON.stringify(resolved)).not.toThrow();
    });

    it('crashes with the qualified key when capabilities exceed repository support', () => {
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
                                repository:
                                    emptyRepository() as unknown as CustomTableRepository,
                            },
                        ],
                    },
                ])
            )
        ).toThrow(/store\/item/);
    });
});

describe('resolveConfig flat fields', () => {
    const flatConfig = (extra: Partial<EntryType> = {}): AstromechConfig => ({
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
    const resolvePost = (fields: Field[]) =>
        resolveConfig({
            db: driver,
            storage: storageDriver,
            entries: { post: { single: 'Post', plural: 'Posts', fields } },
            plugins: [],
        });

    it('throws when a tab appears outside of tabs', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [{ type: 'tab', label: 'Bad', fields: [] }],
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

    it('throws when two data fields in one array share a name', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [
                            { name: 'title', type: 'text' },
                            { name: 'title', type: 'textarea' },
                        ],
                    },
                },
                plugins: [],
            })
        ).toThrow(/post.*duplicate field name "title".*`main.title` and `main.title`/);
    });

    it('throws when a field inside a tab repeats a top-level name', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [
                            { name: 'title', type: 'text' },
                            {
                                type: 'tabs',
                                fields: [
                                    {
                                        type: 'tab',
                                        label: 'Content',
                                        fields: [{ name: 'title', type: 'text' }],
                                    },
                                ],
                            },
                        ],
                    },
                },
                plugins: [],
            })
        ).toThrow(
            /post.*duplicate field name "title".*`main.title` and `main\[1\]\[0\].title`/
        );
    });

    it('throws when `main` and `sidebar` share a data field name', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: {
                            main: [{ name: 'title', type: 'text' }],
                            sidebar: [{ name: 'title', type: 'text' }],
                        },
                    },
                },
                plugins: [],
            })
        ).toThrow(/post.*duplicate field name "title".*`main.title` and `sidebar.title`/);
    });

    it('throws when two fields inside one group share a name', () => {
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
                                name: 'meta',
                                type: 'group',
                                fields: [
                                    { name: 'title', type: 'text' },
                                    { name: 'title', type: 'text' },
                                ],
                            },
                        ],
                    },
                },
                plugins: [],
            })
        ).toThrow(/post.*duplicate field name "title"/);
    });

    it('allows two `tabs` containers in one array', () => {
        expect(() =>
            resolvePost([
                tabs({ fields: [tab({ label: 'One', fields: [text('a')] })] }),
                tabs({ fields: [tab({ label: 'Two', fields: [text('b')] })] }),
            ])
        ).not.toThrow();
    });

    it('throws when a named tab repeats a sibling field name', () => {
        expect(() =>
            resolvePost([
                text('seo'),
                tabs({ fields: [tab('seo', { fields: [text('title')] })] }),
            ])
        ).toThrow(
            /post.*duplicate field name "seo".*`main.seo` and `main\[1\]\[0\].seo`/
        );
    });

    it('throws when a raw tab object carries a name', () => {
        expect(() =>
            resolvePost([
                {
                    type: 'tabs',
                    fields: [{ name: 'content', type: 'tab', fields: [] }],
                },
            ])
        ).toThrow(/post.*a `tab` object cannot carry a name \("content"\)/);
    });

    it('throws when a raw tabs or accordion object carries a name', () => {
        expect(() => resolvePost([{ name: 'tabs', type: 'tabs', fields: [] }])).toThrow(
            /`tabs` is never named/
        );
        expect(() =>
            resolvePost([{ name: 'more', type: 'accordion', fields: [] }])
        ).toThrow(/a `accordion` object cannot carry a name \("more"\)/);
    });

    it('throws on an unnamed group with `boxed: false`', () => {
        expect(() =>
            resolvePost([group({ boxed: false, fields: [text('title')] })])
        ).toThrow(/post.*unnamed `group` with `boxed: false` does nothing/);
    });

    it('allows a named group with `boxed: false`', () => {
        expect(() =>
            resolvePost([group('seo', { boxed: false, fields: [text('title')] })])
        ).not.toThrow();
    });

    it('throws when tabs sit inside a repeater, blocks or tree', () => {
        const inner = tabs({ fields: [tab({ label: 'A', fields: [text('a')] })] });
        expect(() => resolvePost([repeater('items', { fields: [inner] })])).toThrow(
            /post.*`tabs` cannot sit inside a `repeater`/
        );
        expect(() =>
            resolvePost([
                blocks('body', { blocks: [block('hero', { fields: [inner] })] }),
            ])
        ).toThrow(/`tabs` cannot sit inside a `blocks`/);
        expect(() => resolvePost([tree('menu', { fields: [inner] })])).toThrow(
            /`tabs` cannot sit inside a `tree`/
        );
    });

    it('allows tabs inside a named group', () => {
        const inner = tabs({ fields: [tab({ label: 'A', fields: [text('a')] })] });
        expect(() => resolvePost([group('meta', { fields: [inner] })])).not.toThrow();
    });

    it('throws when a field below a nested field sets translatable or searchable', () => {
        expect(() =>
            resolvePost([
                group('meta', {
                    fields: [group({ fields: [text('title', { translatable: false })] })],
                }),
            ])
        ).toThrow(
            /post.*"title" sets `translatable`.*only supported on a top-level field/
        );
        expect(() =>
            resolvePost([
                repeater('items', { fields: [text('title', { searchable: true })] }),
            ])
        ).toThrow(/"title" sets `searchable`/);
        expect(() =>
            resolvePost([
                tabs({
                    fields: [
                        tab('seo', { fields: [text('title', { searchable: true })] }),
                    ],
                }),
            ])
        ).toThrow(/"title" sets `searchable`/);
    });

    it('allows translatable and searchable under a layout field at the top level', () => {
        expect(() =>
            resolvePost([
                group({
                    fields: [text('title', { translatable: false, searchable: true })],
                }),
            ])
        ).not.toThrow();
    });

    it('throws when a raw unnamed tab or accordion has no label', () => {
        expect(() =>
            resolvePost([{ type: 'tabs', fields: [{ type: 'tab', fields: [] }] }])
        ).toThrow(/post.*unnamed `tab` needs a `label`/);
        expect(() => resolvePost([{ type: 'accordion', fields: [] }])).toThrow(
            /unnamed `accordion` needs a `label`/
        );
    });

    it('throws when two fields in one block write the same key', () => {
        expect(() =>
            resolvePost([
                blocks('body', {
                    blocks: [block('hero', { fields: [text('title'), text('title')] })],
                }),
            ])
        ).toThrow(/post.*duplicate field name "title".*`body\[\].title`/);
    });

    it('allows two block types to declare the same field name', () => {
        expect(() =>
            resolvePost([
                blocks('body', {
                    blocks: [
                        block('hero', { fields: [text('title')] }),
                        block('quote', { fields: [text('title')] }),
                    ],
                }),
            ])
        ).not.toThrow();
    });

    it('validates the media and users field trees', () => {
        const withFields = (key: 'media' | 'users', fields: Field[]) =>
            resolveConfig({ ...baseConfig([]), [key]: { fields } });
        expect(() => withFields('media', [text('alt'), text('alt')])).toThrow(
            /Astromech media: duplicate field name "alt"/
        );
        expect(() =>
            withFields('users', [{ type: 'tab', label: 'Bio', fields: [] }])
        ).toThrow(/Astromech users: `tab` must be a direct child of `tabs`/);
    });

    it('allows the same name at different nesting levels', () => {
        expect(() =>
            resolveConfig({
                db: driver,
                storage: storageDriver,
                entries: {
                    post: {
                        single: 'Post',
                        plural: 'Posts',
                        fields: [
                            { name: 'title', type: 'text' },
                            {
                                name: 'meta',
                                type: 'group',
                                fields: [{ name: 'title', type: 'text' }],
                            },
                        ],
                    },
                },
                plugins: [],
            })
        ).not.toThrow();
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
    const withTarget = (target: string): EntryType => ({
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

    it('crashes when an unknown qualified target sits inside a block', () => {
        const inBlock: EntryType = {
            single: 'Linker',
            plural: 'Linkers',
            fields: [
                blocks('body', {
                    blocks: [
                        block('card', {
                            fields: [
                                {
                                    name: 'ref',
                                    type: 'relationship',
                                    target: 'store/gone',
                                },
                            ],
                        }),
                    ],
                }),
            ],
        };
        expect(() =>
            resolveConfig(
                baseConfig([
                    {
                        package: '@astromech/store',
                        entries: [{ ...inBlock, type: 'linker' }],
                    },
                ])
            )
        ).toThrow(/store\/gone/);
    });
});

describe('resolveConfig globals', () => {
    const site = {
        key: 'site',
        label: 'Site',
        fields: [{ name: 'tagline', type: 'text' as const }],
    };

    it('resolves host globals into a keyed map', () => {
        const resolved = resolveConfig({ ...baseConfig([]), globals: [site] });

        expect(Object.keys(resolved.globals)).toEqual(['site']);
        expect(resolved.globals['site']?.id).toBe('site');
        expect(resolved.globals['site']?.capabilities.versioning).toBe(true);
    });

    it('resolves plugin globals under the plugin namespace', () => {
        const resolved = resolveConfig(
            baseConfig([
                { package: '@astromech/seo', globals: [{ ...site, key: 'settings' }] },
            ])
        );

        expect(resolved.pluginGlobals['seo']?.['settings']?.id).toBe('seo/settings');
    });

    it('always produces both maps, empty when nothing is declared', () => {
        const resolved = resolveConfig(baseConfig([]));

        expect(resolved.globals).toEqual({});
        expect(resolved.pluginGlobals).toEqual({});
    });

    it('does not leave the authored globals array on the resolved config', () => {
        const resolved = resolveConfig({ ...baseConfig([]), globals: [site] });

        expect(Array.isArray(resolved.globals)).toBe(false);
    });
});
