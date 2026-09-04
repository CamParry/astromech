/**
 * Atomicity for the two media writes that touch more than one row.
 *
 * `update` and `restoreVersion` each snapshot a version, write the content row
 * and re-index the item's relationships inside one transaction, so a failing
 * index write must leave all three untouched.
 */

import type * as RelationshipRepositoryModule from '@/database/repository/relationships';
import type { StorageDriver } from '@/types/index';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaRepository } from '@/media/repository';
import { mediaService as api } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';
import { makeTranslatableMediaConfig } from './media-config';

// `replaceForSource` only rejects once `state.failing` is set, so the earlier
// setup writes still succeed.
const state = vi.hoisted(() => ({ failing: false }));

vi.mock('@/database/repository/relationships', async (importOriginal) => {
    const actual = await importOriginal<typeof RelationshipRepositoryModule>();
    return {
        ...actual,
        createRelationshipRepository: (
            ...args: Parameters<typeof actual.createRelationshipRepository>
        ) => {
            const repository = actual.createRelationshipRepository(...args);
            return {
                ...repository,
                replaceForSource: (
                    ...replaceArgs: Parameters<typeof repository.replaceForSource>
                ): Promise<void> =>
                    state.failing
                        ? Promise.reject(new Error('boom'))
                        : repository.replaceForSource(...replaceArgs),
            };
        },
    };
});

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

let dbCounter = 0;
let dbPath = '';
let id: string;

beforeEach(async () => {
    // A rolled-back transaction poisons the harness's `:memory:` base connection
    // (post-rollback reads throw "no such table"), so read the result back off a
    // per-test temp FILE db.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-media-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig(makeTranslatableMediaConfig());
    setStorageDriver(noopStorage);
    state.failing = false;

    const row = await createMediaRepository().create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt', fields: { credit: 'first credit' } }
    );
    id = row.id;
});

afterEach(() => {
    vi.restoreAllMocks();
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
