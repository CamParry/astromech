/**
 * Tests for publicSettingKeys derivation in resolveConfig.
 *
 * Covers:
 *  (a) Empty by default
 *  (b) PluginPage with `public: true` adds key + prefix
 *  (c) Non-public plugin pages are excluded
 *  (d) config.publicSettings merged in verbatim
 *  (e) No duplicates when page key and publicSettings overlap
 */

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/core/config-resolver.js';
import type { AstromechConfig, DatabaseDriver, StorageDriver } from '@/types/index.js';

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

function baseConfig(overrides: Partial<AstromechConfig> = {}): AstromechConfig {
    return {
        db: driver,
        storage: storageDriver,
        entries: {},
        plugins: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// (a) Default: no public keys
// ---------------------------------------------------------------------------

describe('publicSettingKeys — default', () => {
    it('is an empty array when no plugins and no publicSettings', () => {
        const resolved = resolveConfig(baseConfig());
        expect(resolved.publicSettingKeys).toEqual([]);
    });

    it('is an empty array when plugin has no public pages', () => {
        const resolved = resolveConfig(
            baseConfig({
                plugins: [
                    {
                        package: 'test-plugin',
                        admin: {
                            pages: [
                                {
                                    path: '/settings',
                                    label: 'Settings',
                                    fields: [{ name: 'key', type: 'text' }],
                                    // public not set → defaults private
                                },
                            ],
                        },
                    },
                ],
            })
        );
        expect(resolved.publicSettingKeys).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// (b) Plugin page with `public: true` → key + prefix
// ---------------------------------------------------------------------------

describe('publicSettingKeys — plugin page public: true', () => {
    it('adds the plugin settings key and its locale prefix', () => {
        const resolved = resolveConfig(
            baseConfig({
                plugins: [
                    {
                        package: 'test-plugin',
                        admin: {
                            pages: [
                                {
                                    path: '/settings',
                                    label: 'Settings',
                                    fields: [],
                                    public: true,
                                },
                            ],
                        },
                    },
                ],
            })
        );
        // Plugin identity: name=test-plugin, permissionNamespace=test-plugin
        // Key: plugin:test-plugin:/settings
        expect(resolved.publicSettingKeys).toContain('plugin:test-plugin:/settings');
        // Prefix for locale variants: plugin:test-plugin:/settings:
        expect(resolved.publicSettingKeys).toContain('plugin:test-plugin:/settings:');
    });

    it('a non-public setting read returns null (key absent from public list)', () => {
        const resolved = resolveConfig(
            baseConfig({
                plugins: [
                    {
                        package: 'test-plugin',
                        admin: {
                            pages: [
                                {
                                    path: '/settings',
                                    label: 'Settings',
                                    fields: [],
                                    // public: false (default)
                                },
                                {
                                    path: '/public-settings',
                                    label: 'Public Settings',
                                    fields: [],
                                    public: true,
                                },
                            ],
                        },
                    },
                ],
            })
        );
        // Only the public page's key is included
        expect(resolved.publicSettingKeys).toContain(
            'plugin:test-plugin:/public-settings'
        );
        expect(resolved.publicSettingKeys).not.toContain('plugin:test-plugin:/settings');
    });
});

// ---------------------------------------------------------------------------
// (c) config.publicSettings merged verbatim
// ---------------------------------------------------------------------------

describe('publicSettingKeys — config.publicSettings', () => {
    it('includes raw publicSettings entries verbatim', () => {
        const resolved = resolveConfig(
            baseConfig({ publicSettings: ['my-key', 'another'] })
        );
        expect(resolved.publicSettingKeys).toContain('my-key');
        expect(resolved.publicSettingKeys).toContain('another');
    });

    it('does not add a prefix entry for raw publicSettings keys (user controls format)', () => {
        const resolved = resolveConfig(baseConfig({ publicSettings: ['my-key'] }));
        // Only 'my-key' itself — no auto-added 'my-key:'
        expect(resolved.publicSettingKeys).not.toContain('my-key:');
    });
});

// ---------------------------------------------------------------------------
// (d) No duplicates
// ---------------------------------------------------------------------------

describe('publicSettingKeys — no duplicates', () => {
    it('does not duplicate a key when plugin page key and publicSettings overlap', () => {
        const resolved = resolveConfig(
            baseConfig({
                plugins: [
                    {
                        package: 'test-plugin',
                        admin: {
                            pages: [
                                {
                                    path: '/settings',
                                    label: 'Settings',
                                    fields: [],
                                    public: true,
                                },
                            ],
                        },
                    },
                ],
                // Also list the same key explicitly
                publicSettings: ['plugin:test-plugin:/settings'],
            })
        );
        const exact = resolved.publicSettingKeys.filter(
            (k) => k === 'plugin:test-plugin:/settings'
        );
        expect(exact).toHaveLength(1);
    });
});
