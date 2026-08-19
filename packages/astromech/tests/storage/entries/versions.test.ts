/**
 * Storage-level tests for `createVersionRepository`. The CRUD/list/latestNumber
 * surface is already exercised through `createBuiltInEntryRepository.versions` in
 * `built-in.test.ts`; this file covers `deleteExcess`, which the built-in
 * wrapper does not expose.
 */

import type { Db } from '@/database/types';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBuiltInEntryRepository } from '@/entries/repository/built-in';
import { createVersionRepository } from '@/entries/repository/versions';

let db: Db;
let entryRepository: ReturnType<typeof createBuiltInEntryRepository>;
let versionRepository: ReturnType<typeof createVersionRepository>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    entryRepository = createBuiltInEntryRepository();
    versionRepository = createVersionRepository(db);
});

describe('deleteExcess', () => {
    it('keeps exactly `keep` newest versions and deletes the rest', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'V', slug: 'v' });
        for (let n = 1; n <= 5; n++) {
            await versionRepository.create({
                entryId: e.id,
                versionNumber: n,
                title: `V${n}`,
                slug: 'v',
                fields: {},
                createdBy: null,
            });
        }

        await versionRepository.deleteExcess(e.id, 2);

        const remaining = await versionRepository.list(e.id);
        expect(remaining.map((v) => v.versionNumber)).toEqual([5, 4]);
    });

    it('is a no-op when there is nothing beyond `keep`', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'V', slug: 'v' });
        await versionRepository.create({
            entryId: e.id,
            versionNumber: 1,
            title: 'V1',
            slug: 'v',
            fields: {},
            createdBy: null,
        });

        await versionRepository.deleteExcess(e.id, 5);

        const remaining = await versionRepository.list(e.id);
        expect(remaining.map((v) => v.versionNumber)).toEqual([1]);
    });
});
