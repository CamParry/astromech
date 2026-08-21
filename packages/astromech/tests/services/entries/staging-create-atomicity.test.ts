/**
 * Atomicity test for entries.createStaged.
 *
 * Asserts that when relationship persistence fails mid-create, the staged
 * row is rolled back and no orphaned record is left in the database.
 */

import type * as RelationshipRepositoryModule from '@/database/repository/relationships';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import { entriesService } from '@/entries/index';

// `createStaged` persists the staged row and its index rows inside a storage
// transaction. `replaceForSource` only rejects once `state.failing` is set,
// so the canonical entry's own (unrelated) index write still succeeds.
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
    dbPath = join(
        tmpdir(),
        `astromech-staging-create-atomicity-${process.pid}-${dbCounter}.db`
    );
    await createFileTestDb(`file:${dbPath}`);
    const cfg = makeTestConfig();
    if (cfg.entries.post) cfg.entries.post.staging = true;
    setupTestConfig(cfg);
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

describe('createStaged atomicity', () => {
    it('rolls back the staged row when relationship persistence throws', async () => {
        const canonical = await api.create({ type: 'post', title: 'Canonical' });

        state.failing = true;
        await expect(
            api.createStaged({ type: 'post', id: canonical.id })
        ).rejects.toThrow('boom');

        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(canonical.id);
    });
});
