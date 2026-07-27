/**
 * Integration tests for field-processing pipeline wired into settings.set().
 *
 * baseKey derivation: resolveAdminPage sets baseKey = page.path. So a page
 * with path 'site' resolves to baseKey 'site'. The settings key is either
 * 'site' (global / non-translatable) or 'site:<locale>' (per-locale).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { settingsApi } from '@/settings/service.js';
import type { AstromechConfig } from '@/types/index.js';

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

describe('settingsApi.set — email field', () => {
    it('rejects an invalid email', async () => {
        await expect(
            settingsApi.set(BASE_KEY, { contact: 'not-an-email' })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { contact: ['Must be a valid email address'] },
        });
    });

    it('accepts a valid email', async () => {
        await expect(
            settingsApi.set(BASE_KEY, { contact: 'hello@example.com' })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Coercion (slug field coerces to lowercase-kebab)
// ---------------------------------------------------------------------------

describe('settingsApi.set — coercion', () => {
    it('coerces a slug field value and persists the coerced form', async () => {
        // 'handle' is type:'slug' which runs coerceSlug → slugify('Hello World') = 'hello-world'
        await settingsApi.set(BASE_KEY, { handle: 'Hello World' });
        const stored = await settingsApi.get(BASE_KEY, { full: true });
        expect((stored as Record<string, unknown>)?.handle).toBe('hello-world');
    });
});

// ---------------------------------------------------------------------------
// Present-only semantics
// ---------------------------------------------------------------------------

describe('settingsApi.set — present-only semantics', () => {
    it('does NOT reject when a required field is absent from the blob (only present fields validated)', async () => {
        // `title` is required but not included here — should NOT fail because
        // present-only semantics mean we only validate keys that appear in the blob.
        await expect(
            settingsApi.set(BASE_KEY, { contact: 'ok@example.com' })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Pass-through (no matching page / non-object value)
// ---------------------------------------------------------------------------

describe('settingsApi.set — pass-through cases', () => {
    it('resolves without validation for a key with no matching admin page', async () => {
        await expect(
            settingsApi.set('no-such-page', { anything: 'goes' })
        ).resolves.toBeDefined();
    });

    it('resolves without validation for a scalar (non-object) value', async () => {
        await expect(settingsApi.set(BASE_KEY, 'just-a-string')).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Uniqueness
// ---------------------------------------------------------------------------

describe('settingsApi.set — unique field', () => {
    it('rejects when another key under the same baseKey holds the same unique value', async () => {
        // Store the handle on the per-locale key
        await settingsApi.set(`${BASE_KEY}:de`, { handle: 'my-handle' });

        // Attempting to store the same handle on the base key should fail
        await expect(
            settingsApi.set(BASE_KEY, { handle: 'my-handle' })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { handle: ['Already in use'] },
        });
    });

    it('does NOT reject when setting the same key again with its own value (self-exclusion)', async () => {
        // Set the handle on the base key first
        await settingsApi.set(BASE_KEY, { handle: 'my-handle' });

        // Re-saving the same value to the same key must not reject (excludeId = key)
        await expect(
            settingsApi.set(BASE_KEY, { handle: 'my-handle' })
        ).resolves.toBeDefined();
    });
});
