/**
 * Atomicity test for entries.restoreVersion.
 *
 * Asserts that when relationship persistence fails mid-restore, the snapshot
 * of the pre-restore state and the row update both roll back together.
 */

import type * as RelationshipRepositoryModule from '@/database/repository/relationships';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import { entriesService } from '@/entries/service';

// `restoreVersion` snapshots the current state, updates the row, and indexes
// it inside one database transaction. `replaceForSource` only rejects once
// `state.failing` is set, so the earlier setup writes still succeed.
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

const api = entriesService;

let dbCounter = 0;
let dbPath = '';

beforeEach(async () => {
    // A rolled-back transaction poisons the harness's `:memory:` base connection
    // (post-rollback reads throw "no such table"), so read the result back off a
    // per-test temp FILE db.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-restore-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig();
    state.failing = false;
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
