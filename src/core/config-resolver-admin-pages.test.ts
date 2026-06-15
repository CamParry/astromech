import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/core/config-resolver.js';
import { defineAdminPage } from '@/index.js';
import type { AdminPage, AstromechConfig, DatabaseDriver, StorageDriver } from '@/types/index.js';

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

const baseConfig = (overrides: Partial<AstromechConfig> = {}): AstromechConfig => ({
    db: driver,
    storage: storageDriver,
    entries: { post: { single: 'Post', plural: 'Posts', fields: [{ name: 'body', type: 'text' }] } },
    plugins: [],
    ...overrides,
});

const simplePage = (overrides: Partial<AdminPage> = {}): AdminPage => ({
    path: 'globals',
    label: 'Globals',
    fields: [{ name: 'siteName', type: 'text' }],
    ...overrides,
});

// ---------------------------------------------------------------------------
// admin.pages — absence
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — absence', () => {
    it('should return [] when admin is not set', () => {
        const resolved = resolveConfig(baseConfig());
        expect(resolved.adminPages).toEqual([]);
    });

    it('should return [] when admin.pages is empty array', () => {
        const resolved = resolveConfig(baseConfig({ admin: { pages: [] } }));
        expect(resolved.adminPages).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// resolveAdminPage — field normalization
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — flat fields normalization', () => {
    it('should normalize a flat fields array to { main, sidebar: [] }', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ fields: [{ name: 'siteName', type: 'text' }] }),
                    ],
                },
            })
        );
        const page = resolved.adminPages[0];
        expect(page?.fields?.main).toHaveLength(1);
        expect(page?.fields?.main[0]?.name).toBe('siteName');
        expect(page?.fields?.sidebar).toEqual([]);
    });

    it('should normalize a { main, sidebar } fields shape through unchanged', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({
                            fields: {
                                main: [{ name: 'siteName', type: 'text' }],
                                sidebar: [{ name: 'logo', type: 'text' }],
                            },
                        }),
                    ],
                },
            })
        );
        const page = resolved.adminPages[0];
        expect(page?.fields?.main).toHaveLength(1);
        expect(page?.fields?.sidebar).toHaveLength(1);
        expect(page?.fields?.main[0]?.name).toBe('siteName');
        expect(page?.fields?.sidebar[0]?.name).toBe('logo');
    });

    it('should default sidebar to [] when only main is given in object shape', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ fields: { main: [{ name: 'title', type: 'text' }] } }),
                    ],
                },
            })
        );
        expect(resolved.adminPages[0]?.fields?.sidebar).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// resolveAdminPage — scalar fields preserved
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — scalar fields preserved', () => {
    it('should preserve path, label, and icon', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ path: 'branding', label: 'Branding', icon: 'Palette' }),
                    ],
                },
            })
        );
        const page = resolved.adminPages[0];
        expect(page?.path).toBe('branding');
        expect(page?.label).toBe('Branding');
        expect(page?.icon).toBe('Palette');
    });

    it('should omit icon when not provided', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage()] } })
        );
        expect('icon' in (resolved.adminPages[0] ?? {})).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// resolveAdminPage — translatable flag
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — translatable flag', () => {
    it('should default translatable to false when not set', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage()] } })
        );
        expect(resolved.adminPages[0]?.translatable).toBe(false);
    });

    it('should preserve translatable: true', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: { pages: [simplePage({ translatable: true })] },
            })
        );
        expect(resolved.adminPages[0]?.translatable).toBe(true);
    });

    it('should preserve explicit translatable: false', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: { pages: [simplePage({ translatable: false })] },
            })
        );
        expect(resolved.adminPages[0]?.translatable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// resolveAdminPage — field tree validation (reuses validateFieldTree)
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — field tree validation', () => {
    it('should throw when a tab appears outside of tabs in main fields', () => {
        expect(() =>
            resolveConfig(
                baseConfig({
                    admin: {
                        pages: [
                            simplePage({
                                path: 'bad-page',
                                fields: [{ name: 'oops', type: 'tab', fields: [] }],
                            }),
                        ],
                    },
                })
            )
        ).toThrow(/bad-page.*tab.*must be a direct child of `tabs`/);
    });

    it('should throw when tabs contains a non-tab child in main fields', () => {
        expect(() =>
            resolveConfig(
                baseConfig({
                    admin: {
                        pages: [
                            simplePage({
                                path: 'bad-page',
                                fields: [
                                    {
                                        name: 'myTabs',
                                        type: 'tabs',
                                        fields: [{ name: 'notATab', type: 'text' }],
                                    },
                                ],
                            }),
                        ],
                    },
                })
            )
        ).toThrow(/bad-page.*tabs.*may only contain.*tab.*children/);
    });

    it('should throw when a tab appears outside of tabs in sidebar fields', () => {
        expect(() =>
            resolveConfig(
                baseConfig({
                    admin: {
                        pages: [
                            simplePage({
                                path: 'bad-sidebar',
                                fields: {
                                    main: [{ name: 'title', type: 'text' }],
                                    sidebar: [{ name: 'stray', type: 'tab', fields: [] }],
                                },
                            }),
                        ],
                    },
                })
            )
        ).toThrow(/bad-sidebar.*tab.*must be a direct child of `tabs`/);
    });

    it('should accept valid tabs → tab structure', () => {
        expect(() =>
            resolveConfig(
                baseConfig({
                    admin: {
                        pages: [
                            simplePage({
                                fields: [
                                    {
                                        name: 'myTabs',
                                        type: 'tabs',
                                        fields: [
                                            {
                                                name: 'tab1',
                                                type: 'tab',
                                                fields: [{ name: 'title', type: 'text' }],
                                            },
                                        ],
                                    },
                                ],
                            }),
                        ],
                    },
                })
            )
        ).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// resolveConfig — multiple pages, order preserved
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — multiple pages', () => {
    it('should preserve order of multiple admin pages', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ path: 'globals', label: 'Globals' }),
                        simplePage({ path: 'branding', label: 'Branding' }),
                        simplePage({ path: 'social', label: 'Social' }),
                    ],
                },
            })
        );
        expect(resolved.adminPages).toHaveLength(3);
        expect(resolved.adminPages[0]?.path).toBe('globals');
        expect(resolved.adminPages[1]?.path).toBe('branding');
        expect(resolved.adminPages[2]?.path).toBe('social');
    });

    it('should resolve each page independently', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ path: 'globals', translatable: true, icon: 'Globe' }),
                        simplePage({ path: 'branding', translatable: false }),
                    ],
                },
            })
        );
        expect(resolved.adminPages[0]?.translatable).toBe(true);
        expect(resolved.adminPages[0]?.icon).toBe('Globe');
        expect(resolved.adminPages[1]?.translatable).toBe(false);
        expect('icon' in (resolved.adminPages[1] ?? {})).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Unified ResolvedAdminPage shape — new fields
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — unified ResolvedAdminPage shape', () => {
    it('host page has baseKey equal to path', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage({ path: 'globals' })] } })
        );
        const page = resolved.adminPages[0];
        expect(page?.baseKey).toBe('globals');
        expect(page?.key).toBe('globals');
    });

    it('host page has componentKey null (fields mode)', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage()] } })
        );
        expect(resolved.adminPages[0]?.componentKey).toBeNull();
    });

    it('host page defaults permission to settings:read', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage()] } })
        );
        expect(resolved.adminPages[0]?.permission).toBe('settings:read');
    });

    it('host page respects explicit permission override', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: { pages: [simplePage({ permission: 'settings:update' })] },
            })
        );
        expect(resolved.adminPages[0]?.permission).toBe('settings:update');
    });

    it('host page nav defaults to true', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage()] } })
        );
        expect(resolved.adminPages[0]?.nav).toBe(true);
    });

    it('host page nav: false is respected', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage({ nav: false })] } })
        );
        expect(resolved.adminPages[0]?.nav).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// XOR validation — exactly one of fields / component
// ---------------------------------------------------------------------------

describe('resolveConfig adminPages — XOR validation', () => {
    it('throws when neither fields nor component is provided', () => {
        const page = { path: 'empty', label: 'Empty' } as AdminPage;
        expect(() =>
            resolveConfig(baseConfig({ admin: { pages: [page] } }))
        ).toThrow(/empty.*exactly one of/);
    });

    it('throws when both fields and component are provided', () => {
        const page: AdminPage = {
            path: 'both',
            label: 'Both',
            fields: [{ name: 'x', type: 'text' }],
            component: './Both.tsx',
        };
        expect(() =>
            resolveConfig(baseConfig({ admin: { pages: [page] } }))
        ).toThrow(/both.*exactly one of/);
    });

    it('throws for host component pages (not yet supported)', () => {
        const page: AdminPage = {
            path: 'widget',
            label: 'Widget',
            component: './Widget.tsx',
        };
        expect(() =>
            resolveConfig(baseConfig({ admin: { pages: [page] } }))
        ).toThrow(/not yet supported/);
    });

    it('accepts a page with only fields', () => {
        expect(() =>
            resolveConfig(baseConfig({ admin: { pages: [simplePage()] } }))
        ).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// defineAdminPage round-trip
// ---------------------------------------------------------------------------

describe('defineAdminPage — round-trip', () => {
    it('returns the page unchanged (fields mode)', () => {
        const page: AdminPage = {
            path: 'globals',
            label: 'Globals',
            fields: [{ name: 'siteName', type: 'text' }],
        };
        expect(defineAdminPage(page)).toBe(page);
    });
});
