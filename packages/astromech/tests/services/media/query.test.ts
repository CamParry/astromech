/**
 * `mediaService.query` filters, pinned across the move onto media storage.
 *
 * The mime-bucket predicate is the one part of the migration whose SQL is
 * genuinely different in kind: it moved from a `DB`-typed expression builder onto
 * the generic one `createStorage.query()` hands out, and the `other` bucket is a
 * raw `sql` fragment naming snake_case columns (CamelCasePlugin does not
 * transform raw fragments). Nothing else in the suite exercises it.
 *
 * Rows are inserted through storage rather than `mediaService.upload` so no storage
 * driver, image decoding or real bytes are involved.
 */

import type { MediaMimeTypeFilter, StorageDriver } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { mediaService } from '@/media/service';
import { createMediaStorage } from '@/media/storage';
import { setStorageDriver } from '@/storage/registry';

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

const FIXTURES = [
    ['a.png', 'image/png'],
    ['b.mp4', 'video/mp4'],
    ['c.pdf', 'application/pdf'],
    ['d.txt', 'text/plain'],
    ['e.bin', 'font/woff2'],
] as const;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);

    const storage = createMediaStorage();
    for (const [filename, mimeType] of FIXTURES) {
        await storage.create({ filename, mimeType, size: 1 });
    }
});

/** Filenames matching a bucket, plus the reported total (they must agree). */
async function bucket(mimeType: MediaMimeTypeFilter): Promise<string[]> {
    const result = await mediaService.query({ where: { mimeType }, limit: 10 });
    expect(result.pagination?.total).toBe(result.data.length);
    return result.data.map((m) => m.filename).sort();
}

describe('mediaService.query — mime buckets', () => {
    it('matches image/* for images', async () => {
        expect(await bucket('images')).toEqual(['a.png']);
    });

    it('matches video/* for videos', async () => {
        expect(await bucket('videos')).toEqual(['b.mp4']);
    });

    it('matches application/* OR text/* for documents', async () => {
        expect(await bucket('documents')).toEqual(['c.pdf', 'd.txt']);
    });

    it('matches everything outside the other three buckets for other', async () => {
        expect(await bucket('other')).toEqual(['e.bin']);
    });
});

describe('mediaService.query — search and pagination', () => {
    it('returns every row unpaginated for limit: all', async () => {
        const result = await mediaService.query({ limit: 'all' });
        expect(result.data.length).toBe(FIXTURES.length);
        expect(result.pagination).toBeNull();
    });

    it('filters on filename', async () => {
        const result = await mediaService.query({ search: 'a.p', limit: 10 });
        expect(result.data.map((m) => m.filename)).toEqual(['a.png']);
        expect(result.pagination?.total).toBe(1);
    });

    it('ANDs the search onto the bucket rather than replacing it', async () => {
        const result = await mediaService.query({
            search: '.p',
            where: { mimeType: 'documents' },
            limit: 10,
        });
        // '.p' alone also matches a.png; the documents bucket excludes it.
        expect(result.data.map((m) => m.filename)).toEqual(['c.pdf']);
        expect(result.pagination?.total).toBe(1);
    });

    it('counts every match, not just the page', async () => {
        const result = await mediaService.query({ limit: 2, page: 2 });
        expect(result.data.length).toBe(2);
        expect(result.pagination).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });
    });
});
