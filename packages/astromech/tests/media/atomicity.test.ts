/**
 * Atomicity for the two media writes that touch more than one row.
 *
 * `update` and `restoreVersion` each snapshot a version, write the content row
 * and re-index the item's relationships inside one transaction, so a failing
 * index write must leave all three untouched.
 */

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noopStorage } from '@tests/fixtures';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { mediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { makeTranslatableMediaConfig } from './media-config';

const api = currentServices.media;

// `replaceForSource` only rejects once `state.failing` is set, so the earlier
// setup writes still succeed.
const state = { failing: false };

beforeEach(() => {
    const { replaceForSource } = relationshipRepository;
    vi.spyOn(relationshipRepository, 'replaceForSource').mockImplementation((...args) =>
        state.failing ? Promise.reject(new Error('boom')) : replaceForSource(...args)
    );
});

let dbCounter = 0;
let dbPath = '';
let id: string;

beforeEach(async () => {
    // Each test gets its own named database file, which `afterEach` deletes.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-media-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig(makeTranslatableMediaConfig());
    setStorageDriver(noopStorage);
    state.failing = false;

    const row = await mediaRepository.create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt', fields: { credit: 'first credit' } }
    );
    id = row.id;
});

afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
        try {
            rmSync(`${dbPath}${suffix}`);
        } catch {
            // best-effort cleanup
        }
    }
});

describe('update atomicity', () => {
    it('rolls back the version and the row when relationship persistence throws', async () => {
        state.failing = true;
        await expect(
            api.update({ id, data: { alt: 'second alt', fields: { credit: 'second' } } })
        ).rejects.toThrow('boom');

        state.failing = false;
        const item = await api.get({ id });
        expect(item?.alt).toBe('first alt');
        expect(item?.fields['credit']).toBe('first credit');
        expect(await api.versions({ id })).toEqual([]);
    });
});

describe('restoreVersion atomicity', () => {
    it('rolls back the snapshot and the row when relationship persistence throws', async () => {
        await api.update({
            id,
            data: { alt: 'second alt', fields: { credit: 'second' } },
        });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version snapshot');

        state.failing = true;
        await expect(api.restoreVersion({ id, versionId: version.id })).rejects.toThrow(
            'boom'
        );

        state.failing = false;
        const item = await api.get({ id });
        expect(item?.alt).toBe('second alt');
        expect(await api.versions({ id })).toHaveLength(1);
    });
});
