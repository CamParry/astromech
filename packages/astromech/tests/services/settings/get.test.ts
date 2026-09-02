/**
 * `settingsService.get` behaviour over the naked key-value class: one key in,
 * one stored value out, with the public/private check deciding whether an
 * unauthenticated read sees it. `settings` declares no fields, so values
 * round-trip verbatim.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { settingsService } from '@/settings/service';

/** `site` and every `site:<locale>` variant are public; `secret` is not. */
function makePublicConfig(): AstromechConfig {
    return { ...makeTestConfig(), publicSettings: ['site', 'site:'] };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makePublicConfig());
});

describe('settingsService.get — one key, one value', () => {
    it('returns the stored object value', async () => {
        await settingsService.set({
            key: 'site',
            value: { title: 'Base', tagline: 'Shared' },
        });

        expect(await settingsService.get({ key: 'site' })).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
    });

    it('reads `site:en` as its own key, never merged into `site`', async () => {
        await settingsService.set({
            key: 'site',
            value: { title: 'Base', tagline: 'Shared' },
        });
        await settingsService.set({ key: 'site:en', value: { title: 'English' } });

        expect(await settingsService.get({ key: 'site' })).toEqual({
            title: 'Base',
            tagline: 'Shared',
        });
        expect(await settingsService.get({ key: 'site:en' })).toEqual({
            title: 'English',
        });
    });

    it('returns a scalar value as stored', async () => {
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

    it('exposes `<key>:<suffix>` variants of a bare publicSettings entry', async () => {
        // A bare entry derives both `site` and the `site:` prefix.
        setupTestConfig({ ...makeTestConfig(), publicSettings: ['site'] });
        await settingsService.set({ key: 'site:en', value: { title: 'English' } });

        expect(await settingsService.get({ key: 'site:en' })).toEqual({
            title: 'English',
        });
    });
});
