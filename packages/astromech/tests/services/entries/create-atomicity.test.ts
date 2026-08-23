/**
 * Atomicity test for entries.create.
 *
 * Asserts that when relationship persistence fails mid-create, the entry row is
 * rolled back and no orphaned record is left in the database.
 */

import type * as RelationshipRepositoryModule from '@/database/repository/relationships';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import { entriesService } from '@/entries/index';

// `create` persists the row and its index rows inside a database transaction.
// Fail `replaceForSource` so the transaction rolls back; everything else
// delegates to the real repository.
vi.mock('@/database/repository/relationships', async (importOriginal) => {
    const actual = await importOriginal<typeof RelationshipRepositoryModule>();
    return {
        ...actual,
        createRelationshipRepository: (
            ...args: Parameters<typeof actual.createRelationshipRepository>
        ) => ({
            ...actual.createRelationshipRepository(...args),
            replaceForSource: (): Promise<void> => Promise.reject(new Error('boom')),
        }),
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
    dbPath = join(tmpdir(), `astromech-create-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig();
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

describe('create atomicity', () => {
    it('rolls back the entry row when relationship persistence throws', async () => {
        await expect(
            api.create({
                type: 'post',
                data: {
                    title: 'Orphan candidate',
                    fields: { related: [crypto.randomUUID()] },
                },
            })
        ).rejects.toThrow('boom');

        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(0);
    });
});
