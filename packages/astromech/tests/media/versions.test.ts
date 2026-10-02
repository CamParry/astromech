/**
 * Version history media has and other resources do not: a version holds the
 * title and caption beside the alt text, and replacing the file (which touches
 * no content row) writes none. The rules every resource shares are in
 * `tests/content/resource-versions.test.ts`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { mediaRepository } from '@/media/repository';
import { makeTranslatableMediaConfig } from './media-config';

const api = currentServices.media;

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTranslatableMediaConfig());
    // Authored through the repository, so the item starts with content but no
    // version: an `update` is then the first thing that replaces a state.
    const row = await mediaRepository.create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt' }
    );
    id = row.id;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('restoreVersion', () => {
    it('restores the title with the alt text, and snapshots both', async () => {
        await api.update({ id, data: { alt: 'second alt', title: 'second title' } });
        const restored = await api.restoreVersion({ id, version: 1 });
        expect(restored.alt).toBe('first alt');
        expect(restored.title).toBeNull();

        expect((await api.versions({ id })).map((v) => v.version)).toEqual([2, 1]);
        const saved = await api.getVersion({ id, version: 2 });
        expect(saved.snapshot.alt).toBe('second alt');
        expect(saved.snapshot.title).toBe('second title');
    });
});

describe('replace', () => {
    it('writes no version and stamps the media row', async () => {
        const before = await api.get({ id });
        if (!before) throw new Error('expected the item');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(before.updatedAt.getTime() + 1000);

        const replaced = await api.replace({
            id,
            file: new File(['bytes' as BlobPart], 'new.png', { type: 'image/png' }),
        });

        expect(await api.versions({ id })).toEqual([]);
        expect(replaced.filename).toBe('new.png');
        expect(replaced.alt).toBe('first alt');
        expect(replaced.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });
});
