/**
 * `settingsService.get` behaviour, pinned across the move onto settings storage.
 *
 * `get` used to load EVERY settings row to build a `byKey` map and read one key
 * out of it; it now fetches `[key, '<key>:<locale>']` targetedly. These tests fix
 * the observable behaviour that swap must not change: the base/locale merge, the
 * per-locale key needing its own public check, and the private-key early return.
 *
 * `makeTestConfig()` declares no admin pages, so `set` runs no field processing —
 * values round-trip verbatim.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { settingsService } from '@/settings/service';
import type { AstromechConfig } from '@/types/index';

/** `site` and every `site:<locale>` variant are public; `secret` is not. */
function makePublicConfig(): AstromechConfig {
    return { ...makeTestConfig(), publicSettings: ['site', 'site:'] };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makePublicConfig());
});

describe('settingsService.get — locale merge', () => {
    it('returns the base value for a key with no locale variant', async () => {
        await settingsService.set({
            key: 'site',
            value: { title: 'Base', tagline: 'Shared' },
        });

        expect(await settingsService.get({ key: 'site' })).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
    });

    it('merges the per-locale variant over the base value', async () => {
        await settingsService.set({
            key: 'site',
            value: { title: 'Base', tagline: 'Shared' },
        });
        await settingsService.set({ key: 'site:en', value: { title: 'English' } });

        // Default locale is 'en'.
        expect(await settingsService.get({ key: 'site' })).toEqual({
            title: 'English',
            tagline: 'Shared',
        });
    });

    it('falls back to the base value for a locale with no variant stored', async () => {
        await settingsService.set({
            key: 'site',
            value: { title: 'Base', tagline: 'Shared' },
        });
        await settingsService.set({ key: 'site:en', value: { title: 'English' } });

        expect(await settingsService.get({ key: 'site', locale: 'de' })).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
    });

    it('returns a scalar base value unmerged', async () => {
        await settingsService.set({ key: 'site', value: 'just-a-string' });

        expect(await settingsService.get({ key: 'site' })).toBe('just-a-string');
    });

    it('returns null for a key that was never set', async () => {
        expect(await settingsService.get({ key: 'site' })).toBeNull();
    });
});

describe('settingsService.get — visibility', () => {
    it('returns null for a private key on a public read', async () => {
        await settingsService.set({ key: 'secret', value: { token: 'abc' } });

        expect(await settingsService.get({ key: 'secret' })).toBeNull();
    });

    it('returns the value for a private key on a full read', async () => {
        await settingsService.set({ key: 'secret', value: { token: 'abc' } });

        expect(await settingsService.get({ key: 'secret', full: true })).toEqual({
            token: 'abc',
        });
    });

    it('exposes per-locale variants of a bare publicSettings entry', async () => {
        // A bare entry derives both `site` and the `site:` prefix, so `site:en`
        // is public too — the same pair a `public: true` admin page derives.
        setupTestConfig({ ...makeTestConfig(), publicSettings: ['site'] });
        await settingsService.set({ key: 'site', value: { title: 'Base' } });
        await settingsService.set({ key: 'site:en', value: { title: 'English' } });

        expect(await settingsService.get({ key: 'site' })).toEqual({
            title: 'English',
        });
    });
});
