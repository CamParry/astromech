/**
 * Integration tests for field-processing pipeline wired into settings.set().
 *
 * baseKey derivation: resolveAdminPage sets baseKey = page.path. So a page
 * with path 'site' resolves to baseKey 'site'. The settings key is either
 * 'site' (global / non-translatable) or 'site:<locale>' (per-locale).
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { settingsService } from '@/settings/service';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAGE_PATH = 'site';
// baseKey = page.path (resolveAdminPage sets baseKey: page.path)
const BASE_KEY = PAGE_PATH;

function makeSettingsFieldConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        admin: {
            pages: [
                {
                    path: PAGE_PATH,
                    label: 'Site Settings',
                    fields: [
                        { name: 'title', type: 'text', label: 'Title', required: true },
                        {
                            name: 'contact',
                            type: 'text',
                            label: 'Contact Email',
                            validation: [{ email: true }],
                        },
                        // type:'slug' coerces to kebab-case; also tested for uniqueness
                        {
                            name: 'handle',
                            type: 'slug',
                            label: 'Handle',
                            validation: [{ unique: true }],
                        },
                    ],
                },
            ],
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeSettingsFieldConfig());
});

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe('settingsService.set — email field', () => {
    it('rejects an invalid email', async () => {
        await expect(
            settingsService.set({ key: BASE_KEY, value: { contact: 'not-an-email' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { contact: ['Must be a valid email address'] },
        });
    });

    it('accepts a valid email', async () => {
        await expect(
            settingsService.set({
                key: BASE_KEY,
                value: { contact: 'hello@example.com' },
            })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Slug field
// ---------------------------------------------------------------------------

describe('settingsService.set — slug field', () => {
    it('rejects a value that is not already a slug', async () => {
        await expect(
            settingsService.set({ key: BASE_KEY, value: { handle: 'Hello World' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: {
                handle: [
                    "Must be lowercase letters, numbers and hyphens: try 'hello-world'",
                ],
            },
        });
    });

    it('persists an already-normal slug', async () => {
        await settingsService.set({ key: BASE_KEY, value: { handle: 'hello-world' } });
        const stored = await settingsService.get({ key: BASE_KEY, full: true });
        expect((stored as Record<string, unknown>)?.handle).toBe('hello-world');
    });
});

// ---------------------------------------------------------------------------
// Present-only semantics
// ---------------------------------------------------------------------------

describe('settingsService.set — present-only semantics', () => {
    it('does NOT reject when a required field is absent from the blob (only present fields validated)', async () => {
        // `title` is required but not included here — should NOT fail because
        // present-only semantics mean we only validate keys that appear in the blob.
        await expect(
            settingsService.set({ key: BASE_KEY, value: { contact: 'ok@example.com' } })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Pass-through (no matching page / non-object value)
// ---------------------------------------------------------------------------

describe('settingsService.set — pass-through cases', () => {
    it('resolves without validation for a key with no matching admin page', async () => {
        await expect(
            settingsService.set({ key: 'no-such-page', value: { anything: 'goes' } })
        ).resolves.toBeDefined();
    });

    it('resolves without validation for a scalar (non-object) value', async () => {
        await expect(
            settingsService.set({ key: BASE_KEY, value: 'just-a-string' })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Uniqueness
// ---------------------------------------------------------------------------

describe('settingsService.set — unique field', () => {
    it('rejects when another key under the same baseKey holds the same unique value', async () => {
        // Store the handle on the per-locale key
        await settingsService.set({
            key: `${BASE_KEY}:de`,
            value: { handle: 'my-handle' },
        });

        // Attempting to store the same handle on the base key should fail
        await expect(
            settingsService.set({ key: BASE_KEY, value: { handle: 'my-handle' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { handle: ['Already in use'] },
        });
    });

    it('does NOT reject when setting the same key again with its own value (self-exclusion)', async () => {
        // Set the handle on the base key first
        await settingsService.set({ key: BASE_KEY, value: { handle: 'my-handle' } });

        // Re-saving the same value to the same key must not reject (excludeId = key)
        await expect(
            settingsService.set({ key: BASE_KEY, value: { handle: 'my-handle' } })
        ).resolves.toBeDefined();
    });
});
