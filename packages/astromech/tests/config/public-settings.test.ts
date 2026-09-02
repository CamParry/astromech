/**
 * Tests for publicSettingKeys derivation in resolveConfig.
 *
 * Covers:
 *  (a) Empty by default
 *  (b) A bare `publicSettings` entry derives the key and its `:` prefix
 *  (c) An entry already ending with `:` is taken as written
 *  (d) No duplicates when both forms are listed
 */

import type { AstromechConfig, DatabaseDriver, StorageDriver } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { isPublicSettingKey } from '@/settings/visibility';

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

function baseConfig(overrides: Partial<AstromechConfig> = {}): AstromechConfig {
    return {
        db: driver,
        storage: storageDriver,
        entries: {},
        plugins: [],
        ...overrides,
    };
}

describe('publicSettingKeys — default', () => {
    it('is an empty array when publicSettings is not set', () => {
        const resolved = resolveConfig(baseConfig());
        expect(resolved.publicSettingKeys).toEqual([]);
    });

    it('is an empty array when publicSettings is empty', () => {
        const resolved = resolveConfig(baseConfig({ publicSettings: [] }));
        expect(resolved.publicSettingKeys).toEqual([]);
    });
});

describe('publicSettingKeys — config.publicSettings', () => {
    it('includes raw publicSettings entries', () => {
        const resolved = resolveConfig(
            baseConfig({ publicSettings: ['my-key', 'another'] })
        );
        expect(resolved.publicSettingKeys).toContain('my-key');
        expect(resolved.publicSettingKeys).toContain('another');
    });

    it('adds the locale prefix for a bare entry, exposing its :locale variants', () => {
        const resolved = resolveConfig(baseConfig({ publicSettings: ['my-key'] }));
        expect(resolved.publicSettingKeys).toContain('my-key');
        expect(resolved.publicSettingKeys).toContain('my-key:');
        expect(isPublicSettingKey('my-key:en', resolved.publicSettingKeys)).toBe(true);
    });

    it('leaves an entry that is already a prefix as written', () => {
        const resolved = resolveConfig(baseConfig({ publicSettings: ['my-key:'] }));
        expect(resolved.publicSettingKeys).toEqual(['my-key:']);
    });

    it('does not duplicate when both the bare key and its prefix are listed', () => {
        const resolved = resolveConfig(
            baseConfig({ publicSettings: ['my-key', 'my-key:'] })
        );
        expect(resolved.publicSettingKeys).toEqual(['my-key', 'my-key:']);
    });

    it('does not duplicate a key listed twice', () => {
        const resolved = resolveConfig(
            baseConfig({ publicSettings: ['my-key', 'my-key'] })
        );
        expect(resolved.publicSettingKeys).toEqual(['my-key', 'my-key:']);
    });
});
