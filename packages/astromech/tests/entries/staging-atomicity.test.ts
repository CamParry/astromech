/**
 * Atomicity tests for entries.createStaged and entries.deleteStaged: when the
 * relationship index write fails, the staged row write rolls back with it.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { getDb } from '@/database/registry';

const entriesService = currentServices.entries;

// Both methods write the staged row and the index rows in one transaction.
// `replaceForSource` only rejects once `state.failing` is set,
// so the canonical entry's own (unrelated) index write still succeeds.
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
    const cfg = makeTestConfig();
    if (cfg.entries.post) cfg.entries.post.staging = true;
    setupTestConfig(cfg);
    state.failing = false;
});

describe('createStaged atomicity', () => {
    it('rolls back the staged row when relationship persistence throws', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Canonical' },
        });

        state.failing = true;
        await expect(
            api.createStaged({ type: 'post', id: canonical.id })
        ).rejects.toThrow('boom');

        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(canonical.id);
    });
});

describe('deleteStaged atomicity', () => {
    it('keeps the staged row when relationship persistence throws', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Canonical' },
        });
        await api.createStaged({ type: 'post', id: canonical.id });

        state.failing = true;
        await expect(
            api.deleteStaged({ type: 'post', id: canonical.id })
        ).rejects.toThrow('boom');

        state.failing = false;
        const staged = await api.getStaged({ type: 'post', id: canonical.id });
        expect(staged?.id).toBe(canonical.id);
    });
});
