/**
 * `mediaService.query` sorting.
 *
 * `sort` was declared on `MediaQueryParams` but dropped by the fetch client, the
 * route and `repository.list` alike, so the media library was always createdAt DESC
 * while the type advertised otherwise. The allowlist matters as much as the
 * ordering: an unknown column must fall back, never reach the query builder.
 */

import type { SortOption, StorageDriver } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMediaRepository } from '@/media/repository';
import { mediaService } from '@/media/service';
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

// Inserted out of every natural order so no assertion can pass by accident.
const FIXTURES = [
    { filename: 'banana.png', mimeType: 'image/png', size: 300 },
    { filename: 'apple.pdf', mimeType: 'application/pdf', size: 100 },
    { filename: 'cherry.mp4', mimeType: 'video/mp4', size: 200 },
] as const;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);

    const repository = createMediaRepository();
    for (const row of FIXTURES) {
        await repository.create({ ...row });
    }
});

async function names(sort?: SortOption): Promise<string[]> {
    const result = await mediaService.query(sort ? { sort, limit: 10 } : { limit: 10 });
    return result.data.map((m) => m.filename);
}

describe('mediaService.query — sort', () => {
    it('sorts by filename ascending', async () => {
        expect(await names({ filename: 'asc' })).toEqual([
            'apple.pdf',
            'banana.png',
            'cherry.mp4',
        ]);
    });

    it('sorts by filename descending', async () => {
        expect(await names({ filename: 'desc' })).toEqual([
            'cherry.mp4',
            'banana.png',
            'apple.pdf',
        ]);
    });

    it('sorts by size', async () => {
        expect(await names({ size: 'asc' })).toEqual([
            'apple.pdf',
            'cherry.mp4',
            'banana.png',
        ]);
    });

    it('sorts by mimeType', async () => {
        expect(await names({ mimeType: 'asc' })).toEqual([
            'apple.pdf',
            'banana.png',
            'cherry.mp4',
        ]);
    });

    it('ignores a column outside the allowlist and falls back to newest-first', async () => {
        expect(await names({ id: 'asc' } as SortOption)).toEqual(await names());
    });

    it('ignores a direction that is not asc or desc', async () => {
        expect(await names({ filename: 'sideways' } as unknown as SortOption)).toEqual(
            await names()
        );
    });

    it('applies the sort alongside a filter rather than replacing it', async () => {
        const result = await mediaService.query({
            where: { mimeType: 'documents' },
            sort: { filename: 'asc' },
            limit: 10,
        });
        expect(result.data.map((m) => m.filename)).toEqual(['apple.pdf']);
    });
});
