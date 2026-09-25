/**
 * Atomicity test for entries.create.
 *
 * Asserts that when relationship persistence fails mid-create, the entry row is
 * rolled back and no orphaned record is left in the database.
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

// `create` persists the row and its index rows inside a database transaction.
// Fail `replaceForSource` so the transaction rolls back; everything else
// delegates to the real repository.
beforeEach(() => {
    vi.spyOn(relationshipRepository, 'replaceForSource').mockRejectedValue(
        new Error('boom')
    );
});

const api = entriesService;

let dbCounter = 0;
let dbPath = '';

beforeEach(async () => {
    // Each test gets its own named database file, which `afterEach` deletes.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-create-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig();
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
