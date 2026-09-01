/**
 * Repository-level tests for `createVersionRepository`. The CRUD/list/latestNumber
 * surface is already exercised through `createEntriesTableRepository.versions` in
 * `entries-table.test.ts`; this file covers what the wrapper cannot show — that a
 * version belongs to a content row and dies with it.
 */

import type { Db } from '@/database/types';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEntriesTableRepository } from '@/entries/repository/entries-table';
import { createVersionRepository } from '@/entries/repository/versions';

let db: Db;
let entryRepository: ReturnType<typeof createEntriesTableRepository>;
let versionRepository: ReturnType<typeof createVersionRepository>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    entryRepository = createEntriesTableRepository();
    versionRepository = createVersionRepository(db);
});

describe('content-row ownership', () => {
    it('lists only the versions of the content row asked for', async () => {
        const en = await entryRepository.create({ type: 'post', title: 'EN', slug: 'v' });
        const de = await entryRepository.update(
            { id: en.id, locale: 'de' },
            { title: 'DE', slug: 'v-de' }
        );

        for (const [contentId, title] of [
            [en.contentId, 'EN v1'],
            [de.contentId, 'DE v1'],
            [de.contentId, 'DE v2'],
        ] as const) {
            await versionRepository.create({
                contentId,
                version: title.endsWith('v2') ? 2 : 1,
                title,
                slug: 'v',
                fields: {},
                createdBy: null,
            });
        }

        expect((await versionRepository.list(en.contentId)).map((v) => v.title)).toEqual([
            'EN v1',
        ]);
        expect((await versionRepository.list(de.contentId)).map((v) => v.title)).toEqual([
            'DE v2',
            'DE v1',
        ]);
    });

    it('cascades away when the entry is deleted', async () => {
        const entry = await entryRepository.create({
            type: 'post',
            title: 'V',
            slug: 'v',
        });
        await versionRepository.create({
            contentId: entry.contentId,
            version: 1,
            title: 'V1',
            slug: 'v',
            fields: {},
            createdBy: null,
        });

        await entryRepository.delete(entry.id);

        expect(await db.selectFrom('entryVersions').selectAll().execute()).toEqual([]);
    });
});
