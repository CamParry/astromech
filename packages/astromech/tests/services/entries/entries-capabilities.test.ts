/**
 * Capability-gating tests for the entries service.
 *
 * Uses a custom config with a `statuses-off` type and a `trash-off` type
 * to exercise CapabilityError throws in publish/unpublish/schedule/trash/
 * restore/emptyTrash. Versions returns [] for versioning-off types (lenient).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { entries } from '@/entries/service.js';
import { CapabilityError } from '@/entries/errors.js';
import type { AstromechConfig } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Config with capability-restricted types
// ---------------------------------------------------------------------------

function makeCapabilityTestConfig(): AstromechConfig {
    return {
        db: {
            type: 'test',
            getInstance() {
                throw new Error('test driver getInstance should not be called');
            },
        },
        storage: {
            name: 'test-noop',
            async put() {
                return undefined;
            },
            async get() {
                return null;
            },
            async delete(): Promise<void> {
                return undefined;
            },
            async list() {
                return [];
            },
        },
        defaultLocale: 'en',
        locales: ['en'],
        entries: {
            // All capabilities default ON — no restriction.
            full: {
                single: 'Full',
                plural: 'Fulls',
                versioning: true,
                translatable: false,
                fields: [{ name: 'body', type: 'text' as const, label: 'Body' }],
            },
            // statuses explicitly off.
            nostatuses: {
                single: 'NoStatuses',
                plural: 'NoStatuses',
                statuses: false,
                versioning: false,
                translatable: false,
                fields: [{ name: 'body', type: 'text' as const, label: 'Body' }],
            },
            // trash explicitly off.
            notrash: {
                single: 'NoTrash',
                plural: 'NoTrash',
                trash: false,
                versioning: false,
                translatable: false,
                fields: [{ name: 'body', type: 'text' as const, label: 'Body' }],
            },
            // versioning explicitly off.
            noversioning: {
                single: 'NoVersioning',
                plural: 'NoVersioning',
                versioning: false,
                translatable: false,
                fields: [{ name: 'body', type: 'text' as const, label: 'Body' }],
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
    await createTestDb();
    setupTestConfig(makeCapabilityTestConfig());
});

// ---------------------------------------------------------------------------
// Helper: create a minimal entry for a type.
// ---------------------------------------------------------------------------

async function createEntry(type: string): Promise<string> {
    const entry = await entries.create({ type, title: `Test ${type}` });
    return entry.id;
}

// ---------------------------------------------------------------------------
// statuses capability
// ---------------------------------------------------------------------------

describe('statuses capability', () => {
    it('publish throws CapabilityError on statuses-off type', async () => {
        const id = await createEntry('nostatuses');
        await expect(entries.publish({ type: 'nostatuses', id })).rejects.toThrow(
            CapabilityError
        );
    });

    it('unpublish throws CapabilityError on statuses-off type', async () => {
        const id = await createEntry('nostatuses');
        await expect(entries.unpublish({ type: 'nostatuses', id })).rejects.toThrow(
            CapabilityError
        );
    });

    it('schedule throws CapabilityError on statuses-off type', async () => {
        const id = await createEntry('nostatuses');
        await expect(
            entries.schedule({ type: 'nostatuses', id, publishAt: new Date() })
        ).rejects.toThrow(CapabilityError);
    });

    it('CapabilityError carries correct type and capability', async () => {
        const id = await createEntry('nostatuses');
        const err = await entries
            .publish({ type: 'nostatuses', id })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CapabilityError);
        const capErr = err as CapabilityError;
        expect(capErr.entryType).toBe('nostatuses');
        expect(capErr.capability).toBe('statuses');
    });

    it('publish works on full type (statuses on)', async () => {
        const id = await createEntry('full');
        const result = await entries.publish({ type: 'full', id });
        const entry = Array.isArray(result) ? result[0] : result;
        expect(entry?.status).toBe('published');
    });
});

// ---------------------------------------------------------------------------
// trash capability
// ---------------------------------------------------------------------------

describe('trash capability', () => {
    it('trash throws CapabilityError on trash-off type', async () => {
        const id = await createEntry('notrash');
        await expect(entries.trash({ type: 'notrash', id })).rejects.toThrow(
            CapabilityError
        );
    });

    it('restore throws CapabilityError on trash-off type', async () => {
        const id = await createEntry('notrash');
        await expect(entries.restore({ type: 'notrash', id })).rejects.toThrow(
            CapabilityError
        );
    });

    it('emptyTrash throws CapabilityError on trash-off type', async () => {
        await expect(entries.emptyTrash({ type: 'notrash' })).rejects.toThrow(
            CapabilityError
        );
    });

    it('delete always works on trash-off type (hard delete)', async () => {
        const id = await createEntry('notrash');
        await expect(entries.delete({ type: 'notrash', id })).resolves.toBeUndefined();
    });

    it('trash works on full type (trash on)', async () => {
        const id = await createEntry('full');
        await expect(entries.trash({ type: 'full', id })).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// versioning (lenient — returns [] for versioning-off types)
// ---------------------------------------------------------------------------

describe('versioning leniency', () => {
    it('versions returns [] for versioning-off type', async () => {
        const id = await createEntry('noversioning');
        const result = await entries.versions({ type: 'noversioning', id });
        expect(result).toEqual([]);
    });

    it('versions returns [] for nostatuses type (also versioning-off)', async () => {
        const id = await createEntry('nostatuses');
        const result = await entries.versions({ type: 'nostatuses', id });
        expect(result).toEqual([]);
    });
});
