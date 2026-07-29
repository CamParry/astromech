/**
 * Storage-level tests for `createVersionStorage`. The CRUD/list/latestNumber
 * surface is already exercised through `createBuiltInEntryStorage.versions` in
 * `built-in.test.ts`; this file covers `deleteExcess`, which the built-in
 * wrapper does not expose.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { createBuiltInEntryStorage } from '@/entries/storage/built-in.js';
import { createVersionStorage } from '@/entries/storage/versions.js';
import type { Db } from '@/database/types.js';

let db: Db;
let entryStorage: ReturnType<typeof createBuiltInEntryStorage>;
let versionStorage: ReturnType<typeof createVersionStorage>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    entryStorage = createBuiltInEntryStorage();
    versionStorage = createVersionStorage(db);
});

describe('deleteExcess', () => {
    it('keeps exactly `keep` newest versions and deletes the rest', async () => {
        const e = await entryStorage.create({ type: 'post', title: 'V', slug: 'v' });
        for (let n = 1; n <= 5; n++) {
            await versionStorage.create({
                entryId: e.id,
                versionNumber: n,
                title: `V${n}`,
                slug: 'v',
                fields: {},
                relations: {},
                createdBy: null,
            });
        }

        await versionStorage.deleteExcess(e.id, 2);

        const remaining = await versionStorage.list(e.id);
        expect(remaining.map((v) => v.versionNumber)).toEqual([5, 4]);
    });

    it('is a no-op when there is nothing beyond `keep`', async () => {
        const e = await entryStorage.create({ type: 'post', title: 'V', slug: 'v' });
        await versionStorage.create({
            entryId: e.id,
            versionNumber: 1,
            title: 'V1',
            slug: 'v',
            fields: {},
            relations: {},
            createdBy: null,
        });

        await versionStorage.deleteExcess(e.id, 5);

        const remaining = await versionStorage.list(e.id);
        expect(remaining.map((v) => v.versionNumber)).toEqual([1]);
    });
});
