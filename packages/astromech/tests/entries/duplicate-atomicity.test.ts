/**
 * Atomicity test for entries.duplicate.
 *
 * Asserts that when relationship persistence fails mid-duplicate, the new
 * entry row is rolled back and no orphaned record is left in the database.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { getDb } from '@/database/registry';

const entriesService = currentServices.entries;

// `duplicate` persists the new row and its index rows inside a database
// transaction. `replaceForSource` only rejects once `state.failing` is set,
// so the source entry's own (unrelated) index write still succeeds.
const state = { failing: false };

beforeEach(() => {
    const { replaceForSource } = relationshipRepository;
    vi.spyOn(relationshipRepository, 'replaceForSource').mockImplementation((...args) =>
        state.failing ? Promise.reject(new Error('boom')) : replaceForSource(...args)
    );
});

const api = entriesService;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
    state.failing = false;
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
