/**
 * Integration tests for field-processing pipeline wired into the media service
 * (update). Validates coercion, required fields, uniqueness, and self-exclusion.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { mediaApi } from '@/media/service.js';
import type { AstromechConfig, StorageDriver } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Minimal file helpers
// ---------------------------------------------------------------------------

function textFile(name = 'doc.txt'): File {
    return new File(['hello' as BlobPart], name, { type: 'text/plain' });
}

// ---------------------------------------------------------------------------
// Tracking storage (reuse pattern from service.test.ts)
// ---------------------------------------------------------------------------

function makeTrackingStorage(): StorageDriver {
    const store = new Map<string, Uint8Array>();
    return {
        name: 'tracking',
        async put(key, body) {
            if (body instanceof Uint8Array) {
                store.set(key, body);
            } else {
                const reader = (body as ReadableStream<Uint8Array>).getReader();
                const chunks: Uint8Array[] = [];
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) chunks.push(value);
                }
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                    out.set(c, off);
                    off += c.length;
                }
                store.set(key, out);
            }
        },
        async get(key) {
            const bytes = store.get(key);
            if (!bytes) return null;
            const body = new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(bytes);
                    c.close();
                },
            });
            return { body, size: bytes.length };
        },
        async delete(key) {
            store.delete(key);
        },
        async list(prefix) {
            return [...store.keys()].filter((k) => k.startsWith(prefix));
        },
        getDirectUrl: () => null,
    };
}

// ---------------------------------------------------------------------------
// Config with custom media fields
// ---------------------------------------------------------------------------

function makeMediaFieldConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        media: {
            fields: [
                { name: 'caption', type: 'text', label: 'Caption', required: true },
                { name: 'slug_field', type: 'slug', label: 'Slug' },
                {
                    name: 'tag',
                    type: 'text',
                    label: 'Tag',
                    validation: [{ unique: true }],
                },
            ],
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeMediaFieldConfig());
    setStorageDriver(makeTrackingStorage());
});

// ---------------------------------------------------------------------------
// update: required field
// ---------------------------------------------------------------------------

describe('mediaApi.update — required field', () => {
    it('rejects when required field is absent', async () => {
        const m = await mediaApi.upload(textFile());
        await expect(mediaApi.update(m.id, { fields: {} })).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { caption: ['This field is required'] },
        });
    });

    it('rejects when required field is empty string', async () => {
        const m = await mediaApi.upload(textFile());
        await expect(
            mediaApi.update(m.id, { fields: { caption: '' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { caption: ['This field is required'] },
        });
    });
});

// ---------------------------------------------------------------------------
// update: coercion
// ---------------------------------------------------------------------------

describe('mediaApi.update — coercion', () => {
    it('coerces a slug field to slugified form and persists it', async () => {
        const m = await mediaApi.upload(textFile());
        const updated = await mediaApi.update(m.id, {
            fields: { caption: 'A photo', slug_field: 'My Image Title' },
        });
        expect(updated.fields?.slug_field).toBe('my-image-title');
    });
});

// ---------------------------------------------------------------------------
// update: uniqueness
// ---------------------------------------------------------------------------

describe('mediaApi.update — uniqueness', () => {
    it('rejects a duplicate tag across two media items', async () => {
        const a = await mediaApi.upload(textFile('a.txt'));
        await mediaApi.update(a.id, { fields: { caption: 'A', tag: 'alpha' } });

        const b = await mediaApi.upload(textFile('b.txt'));
        await expect(
            mediaApi.update(b.id, { fields: { caption: 'B', tag: 'alpha' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { tag: ['Already in use'] },
        });
    });

    it('allows a media item to keep its own unique tag (self-exclusion)', async () => {
        const m = await mediaApi.upload(textFile());
        await mediaApi.update(m.id, { fields: { caption: 'First', tag: 'beta' } });

        const updated = await mediaApi.update(m.id, {
            fields: { caption: 'Updated', tag: 'beta' },
        });
        expect(updated.fields?.tag).toBe('beta');
    });

    it('accepts a different unique tag', async () => {
        const a = await mediaApi.upload(textFile('a.txt'));
        await mediaApi.update(a.id, { fields: { caption: 'A', tag: 'gamma' } });

        const b = await mediaApi.upload(textFile('b.txt'));
        const updated = await mediaApi.update(b.id, {
            fields: { caption: 'B', tag: 'delta' },
        });
        expect(updated.fields?.tag).toBe('delta');
    });
});

// ---------------------------------------------------------------------------
// update: no fields → skips validation
// ---------------------------------------------------------------------------

describe('mediaApi.update — no fields key', () => {
    it('updates alt without triggering field validation', async () => {
        const m = await mediaApi.upload(textFile());
        const updated = await mediaApi.update(m.id, { alt: 'A nice doc' });
        expect(updated.alt).toBe('A nice doc');
    });
});
