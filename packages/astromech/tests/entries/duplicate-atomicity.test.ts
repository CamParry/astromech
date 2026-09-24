/**
 * Atomicity test for entries.duplicate.
 *
 * Asserts that when relationship persistence fails mid-duplicate, the new
 * entry row is rolled back and no orphaned record is left in the database.
 */

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import {
    getRelationshipRepository,
    setRelationshipRepository,
} from '@/content/repository/relationships';
import { getDb } from '@/database/registry';

const entriesService = currentServices.entries;

// `duplicate` persists the new row and its index rows inside a database
// transaction. `replaceForSource` only rejects once `state.failing` is set,
// so the source entry's own (unrelated) index write still succeeds.
const state = { failing: false };

beforeEach(() => {
    const relationships = getRelationshipRepository();
    setRelationshipRepository({
        ...relationships,
        replaceForSource: (
            ...args: Parameters<typeof relationships.replaceForSource>
        ): Promise<void> =>
            state.failing
                ? Promise.reject(new Error('boom'))
                : relationships.replaceForSource(...args),
    });
    return (): void => {
        setRelationshipRepository(relationships);
    };
});

const api = entriesService;

let dbCounter = 0;
let dbPath = '';

beforeEach(async () => {
    // Each test gets its own named database file, which `afterEach` deletes.
    dbCounter += 1;
    dbPath = join(
        tmpdir(),
        `astromech-duplicate-atomicity-${process.pid}-${dbCounter}.db`
    );
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

describe('duplicate atomicity', () => {
    it('rolls back the new row when relationship persistence throws', async () => {
        const source = await api.create({ type: 'post', data: { title: 'Source' } });

        state.failing = true;
        await expect(api.duplicate({ type: 'post', id: source.id })).rejects.toThrow(
            'boom'
        );

        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(source.id);
    });
});
