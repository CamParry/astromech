/**
 * Atomicity test for entries.restoreVersion.
 *
 * Asserts that when relationship persistence fails mid-restore, the snapshot
 * of the pre-restore state and the row update both roll back together.
 */

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { getDb } from '@/database/registry';

const entriesService = currentServices.entries;

// `restoreVersion` snapshots the current state, updates the row, and indexes
// it inside one database transaction. `replaceForSource` only rejects once
// `state.failing` is set, so the earlier setup writes still succeed.
const state = { failing: false };

beforeEach(() => {
    const { replaceForSource } = relationshipRepository;
    vi.spyOn(relationshipRepository, 'replaceForSource').mockImplementation((...args) =>
        state.failing ? Promise.reject(new Error('boom')) : replaceForSource(...args)
    );
});

const api = entriesService;

let dbCounter = 0;
let dbPath = '';

beforeEach(async () => {
    // Each test gets its own named database file, which `afterEach` deletes.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-restore-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig();
    state.failing = false;
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

describe('restoreVersion atomicity', () => {
    it('rolls back the snapshot and the update when relationship persistence throws', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Orig', fields: { body: 'orig' } },
        });
        await api.update({
            type: 'post',
            id: entry.id,
            data: { title: 'Changed', fields: { body: 'changed' } },
        });
        const [v1] = await api.versions({ type: 'post', id: entry.id });
        if (!v1) throw new Error('expected a version snapshot');
        const versionsBefore = await api.versions({ type: 'post', id: entry.id });

        state.failing = true;
        await expect(
            api.restoreVersion({ type: 'post', id: entry.id, versionId: v1.id })
        ).rejects.toThrow('boom');

        const row = await getDb()
            .selectFrom('entryContent')
            .selectAll()
            .where('entryId', '=', entry.id)
            .executeTakeFirstOrThrow();
        expect(row.title).toBe('Changed');

        const versionsAfter = await api.versions({ type: 'post', id: entry.id });
        expect(versionsAfter).toHaveLength(versionsBefore.length);
    });
});
