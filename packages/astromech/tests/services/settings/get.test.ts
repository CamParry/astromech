/**
 * `settingsApi.get` behaviour, pinned across the move onto settings storage.
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
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { settingsApi } from '@/settings/service.js';
import type { AstromechConfig } from '@/types/index.js';

/** `site` and every `site:<locale>` variant are public; `secret` is not. */
function makePublicConfig(): AstromechConfig {
    return { ...makeTestConfig(), publicSettings: ['site', 'site:'] };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makePublicConfig());
});

describe('settingsApi.get — locale merge', () => {
    it('returns the base value for a key with no locale variant', async () => {
        await settingsApi.set('site', { title: 'Base', tagline: 'Shared' });

        expect(await settingsApi.get('site')).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
    });

    it('merges the per-locale variant over the base value', async () => {
        await settingsApi.set('site', { title: 'Base', tagline: 'Shared' });
        await settingsApi.set('site:en', { title: 'English' });

        // Default locale is 'en'.
        expect(await settingsApi.get('site')).toEqual({
            title: 'English',
            tagline: 'Shared',
        });
    });

    it('falls back to the base value for a locale with no variant stored', async () => {
        await settingsApi.set('site', { title: 'Base', tagline: 'Shared' });
        await settingsApi.set('site:en', { title: 'English' });

        expect(await settingsApi.get('site', { locale: 'de' })).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
    });

    it('returns a scalar base value unmerged', async () => {
        await settingsApi.set('site', 'just-a-string');

        expect(await settingsApi.get('site')).toBe('just-a-string');
    });

    it('returns null for a key that was never set', async () => {
        expect(await settingsApi.get('site')).toBeNull();
    });
});

describe('settingsApi.get — visibility', () => {
    it('returns null for a private key on a public read', async () => {
        await settingsApi.set('secret', { token: 'abc' });

        expect(await settingsApi.get('secret')).toBeNull();
    });

    it('returns the value for a private key on a full read', async () => {
        await settingsApi.set('secret', { token: 'abc' });

        expect(await settingsApi.get('secret', { full: true })).toEqual({
            token: 'abc',
        });
    });

    it('withholds a private per-locale variant from a public read of a public base key', async () => {
        // Only the bare key is public here — `site:en` is NOT covered, because a
        // bare entry is an exact match, not a prefix.
        setupTestConfig({ ...makeTestConfig(), publicSettings: ['site'] });
        await settingsApi.set('site', { title: 'Base' });
        await settingsApi.set('site:en', { title: 'English' });

        expect(await settingsApi.get('site')).toEqual({ title: 'Base' });
        expect(await settingsApi.get('site', { full: true })).toEqual({
            title: 'English',
        });
    });
});
