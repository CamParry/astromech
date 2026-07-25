/**
 * Atomicity test for entries.create.
 *
 * Asserts that when saveRelationships fails mid-create, the entry row is
 * rolled back and no orphaned record is left in the database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { Astromech } from '@/transport/local/index.js';
import { getDb } from '@/database/registry.js';
import { RelationshipsRepository } from '@/database/repositories/relationships.js';
import { entriesTable } from '@/database/schema.js';

const api = Astromech.entries;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('create atomicity', () => {
    it('rolls back the entry row when saveRelationships throws', async () => {
        // Force RelationshipsRepository.replaceAll to throw once, simulating a
        // mid-transaction failure during relationship persistence.
        vi.spyOn(RelationshipsRepository.prototype, 'replaceAll').mockRejectedValueOnce(
            new Error('boom')
        );

        await expect(
            api.create({
                type: 'post',
                title: 'Orphan candidate',
                fields: { related: [crypto.randomUUID()] },
            })
        ).rejects.toThrow('boom');

        // With the atomicity fix, the entry row must have been rolled back.
        // No orphaned row should exist.
        const rows = await getDb().select().from(entriesTable);
        expect(rows).toHaveLength(0);
    });
});
