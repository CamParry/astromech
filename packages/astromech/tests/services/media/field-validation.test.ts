/**
 * Integration tests for field-processing pipeline wired into the media service
 * (update). Validates coercion, required fields, uniqueness, and self-exclusion.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { setStorageDriver } from '@/storage/registry';
import { mediaService } from '@/media/service';
import type { AstromechConfig, StorageDriver } from '@/types/index';

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
            return { body, size: bytes.length, totalSize: bytes.length };
        },
        async stat(key) {
            const bytes = store.get(key);
            return bytes ? { size: bytes.length } : null;
        },
        async delete(key) {
            store.delete(key);
        },
        async list(prefix) {
            return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)) };
        },
        getPublicUrl: () => null,
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

describe('mediaService.update — required field', () => {
    it('rejects when required field is absent', async () => {
        const m = await mediaService.upload({ file: textFile() });
        await expect(
            mediaService.update({ id: m.id, data: { fields: {} } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { caption: ['This field is required'] },
        });
    });

    it('rejects when required field is empty string', async () => {
        const m = await mediaService.upload({ file: textFile() });
        await expect(
            mediaService.update({ id: m.id, data: { fields: { caption: '' } } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { caption: ['This field is required'] },
        });
    });
});

// ---------------------------------------------------------------------------
// update: slug field
// ---------------------------------------------------------------------------

describe('mediaService.update — slug field', () => {
    it('rejects a value that is not already a slug', async () => {
        const m = await mediaService.upload({ file: textFile() });
        await expect(
            mediaService.update({
                id: m.id,
                data: {
                    fields: { caption: 'A photo', slug_field: 'My Image Title' },
                },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: {
                slug_field: [
                    "Must be lowercase letters, numbers and hyphens: try 'my-image-title'",
                ],
            },
        });
    });

    it('persists an already-normal slug', async () => {
        const m = await mediaService.upload({ file: textFile() });
        const updated = await mediaService.update({
            id: m.id,
            data: {
                fields: { caption: 'A photo', slug_field: 'my-image-title' },
            },
        });
        expect(updated.fields?.slug_field).toBe('my-image-title');
    });
});

// ---------------------------------------------------------------------------
// update: uniqueness
// ---------------------------------------------------------------------------

describe('mediaService.update — uniqueness', () => {
    it('rejects a duplicate tag across two media items', async () => {
        const a = await mediaService.upload({ file: textFile('a.txt') });
        await mediaService.update({
            id: a.id,
            data: { fields: { caption: 'A', tag: 'alpha' } },
        });

        const b = await mediaService.upload({ file: textFile('b.txt') });
        await expect(
            mediaService.update({
                id: b.id,
                data: { fields: { caption: 'B', tag: 'alpha' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { tag: ['Already in use'] },
        });
    });

    it('allows a media item to keep its own unique tag (self-exclusion)', async () => {
        const m = await mediaService.upload({ file: textFile() });
        await mediaService.update({
            id: m.id,
            data: { fields: { caption: 'First', tag: 'beta' } },
        });

        const updated = await mediaService.update({
            id: m.id,
            data: {
                fields: { caption: 'Updated', tag: 'beta' },
            },
        });
        expect(updated.fields?.tag).toBe('beta');
    });

    it('accepts a different unique tag', async () => {
        const a = await mediaService.upload({ file: textFile('a.txt') });
        await mediaService.update({
            id: a.id,
            data: { fields: { caption: 'A', tag: 'gamma' } },
        });

        const b = await mediaService.upload({ file: textFile('b.txt') });
        const updated = await mediaService.update({
            id: b.id,
            data: {
                fields: { caption: 'B', tag: 'delta' },
            },
        });
        expect(updated.fields?.tag).toBe('delta');
    });
});

// ---------------------------------------------------------------------------
// update: fields merge
// ---------------------------------------------------------------------------

describe('mediaService.update — fields merge', () => {
    it('keeps fields the patch omits', async () => {
        const m = await mediaService.upload({ file: textFile() });
        await mediaService.update({
            id: m.id,
            data: { fields: { caption: 'A photo', tag: 'omega' } },
        });
        const updated = await mediaService.update({
            id: m.id,
            data: { fields: { slug_field: 'second-pass' } },
        });
        expect(updated.fields).toMatchObject({
            caption: 'A photo',
            tag: 'omega',
            slug_field: 'second-pass',
        });
    });
});

// ---------------------------------------------------------------------------
// update: no fields → skips validation
// ---------------------------------------------------------------------------

describe('mediaService.update — no fields key', () => {
    it('updates alt without triggering field validation', async () => {
        const m = await mediaService.upload({ file: textFile() });
        const updated = await mediaService.update({
            id: m.id,
            data: { alt: 'A nice doc' },
        });
        expect(updated.alt).toBe('A nice doc');
    });
});
