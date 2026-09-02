import type {
    AdminPage,
    AstromechConfig,
    DatabaseDriver,
    StorageDriver,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { defineAdminPage } from '@/config/define-admin-page';
import { resolveConfig } from '@/config/resolve';

const driver: DatabaseDriver = {
    type: 'test',
    getInstance() {
        throw new Error('not called');
    },
    createDialect() {
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

const baseConfig = (overrides: Partial<AstromechConfig> = {}): AstromechConfig => ({
    db: driver,
    storage: storageDriver,
    entries: {
        post: {
            single: 'Post',
            plural: 'Posts',
            fields: [{ name: 'body', type: 'text' }],
        },
    },
    plugins: [],
    ...overrides,
});

const simplePage = (overrides: Partial<AdminPage> = {}): AdminPage => ({
    path: 'site-status',
    label: 'Site Status',
    component: './src/admin/pages/site-status.tsx',
    ...overrides,
});

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

describe('resolveConfig adminPages — scalar fields preserved', () => {
    it('should preserve path, label, and icon', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({
                            path: 'branding',
                            label: 'Branding',
                            icon: 'Palette',
                        }),
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
        const resolved = resolveConfig(baseConfig({ admin: { pages: [simplePage()] } }));
        expect('icon' in (resolved.adminPages[0] ?? {})).toBe(false);
    });
});

describe('resolveConfig adminPages — multiple pages', () => {
    it('should preserve order of multiple admin pages', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ path: 'status', label: 'Status' }),
                        simplePage({ path: 'branding', label: 'Branding' }),
                        simplePage({ path: 'social', label: 'Social' }),
                    ],
                },
            })
        );
        expect(resolved.adminPages).toHaveLength(3);
        expect(resolved.adminPages[0]?.path).toBe('status');
        expect(resolved.adminPages[1]?.path).toBe('branding');
        expect(resolved.adminPages[2]?.path).toBe('social');
    });

    it('should resolve each page independently', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: {
                    pages: [
                        simplePage({ path: 'status', icon: 'Activity' }),
                        simplePage({ path: 'branding' }),
                    ],
                },
            })
        );
        expect(resolved.adminPages[0]?.icon).toBe('Activity');
        expect('icon' in (resolved.adminPages[1] ?? {})).toBe(false);
    });
});

describe('resolveConfig adminPages — unified ResolvedAdminPage shape', () => {
    it('host page keys on its path', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage({ path: 'status' })] } })
        );
        const page = resolved.adminPages[0];
        expect(page?.key).toBe('status');
        expect(page?.componentKey).toBe('status');
    });

    it('host page defaults permission to null (nothing to guard)', () => {
        const resolved = resolveConfig(baseConfig({ admin: { pages: [simplePage()] } }));
        expect(resolved.adminPages[0]?.permission).toBeNull();
    });

    it('host page respects an explicit permission', () => {
        const resolved = resolveConfig(
            baseConfig({
                admin: { pages: [simplePage({ permission: 'users:read' })] },
            })
        );
        expect(resolved.adminPages[0]?.permission).toBe('users:read');
    });

    it('host page nav defaults to true', () => {
        const resolved = resolveConfig(baseConfig({ admin: { pages: [simplePage()] } }));
        expect(resolved.adminPages[0]?.nav).toBe(true);
    });

    it('host page nav: false is respected', () => {
        const resolved = resolveConfig(
            baseConfig({ admin: { pages: [simplePage({ nav: false })] } })
        );
        expect(resolved.adminPages[0]?.nav).toBe(false);
    });
});

describe('defineAdminPage — round-trip', () => {
    it('returns the page unchanged', () => {
        const page: AdminPage = {
            path: 'site-status',
            label: 'Site Status',
            component: './src/admin/pages/site-status.tsx',
        };
        expect(defineAdminPage(page)).toBe(page);
    });
});
