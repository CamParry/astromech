/**
 * The shared drafts repository over `entry_drafts` and `global_drafts`: a draft
 * round-trips, a second save of a locale updates its one row, a draft is per
 * locale, and deleting the resource deletes its drafts.
 */

import type { Db } from '@/database/types';
import type { JsonObject } from '@/types/index';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable, globalsTable } from '@/database/tables';
import {
    entryDraftRepository,
    entryRepository,
} from '@/entries/repository/entries-table';
import { globalDraftRepository } from '@/globals/repository';

let db: Db;
/** Makes each created entry's slug and global's key unique. */
let created = 0;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

/** How the checks reach one resource's drafts. */
type Adapter = {
    /** Create a resource and answer its id. */
    create(): Promise<string>;
    /** Hard-delete the resource row. */
    remove(id: string): Promise<void>;
    /** The resource's own content columns for a draft holding `title`. */
    content(title: string): Record<string, unknown>;
    save(draft: Record<string, unknown>): Promise<Record<string, unknown>>;
    findOne(id: string, locale: string): Promise<Record<string, unknown> | null>;
    findMany(id: string): Promise<Record<string, unknown>[]>;
    delete(id: string, locale: string): Promise<boolean>;
    deleteAll(id: string): Promise<number>;
    /** The resource-id column the drafts table is keyed by. */
    idColumn: string;
};

const ADAPTERS: Record<'entry' | 'global', Adapter> = {
    entry: {
        async create() {
            return (
                await entryRepository.create({
                    type: 'post',
                    title: 'Live',
                    slug: `live-${++created}`,
                })
            ).id;
        },
        remove: (id) => createRepository(entriesTable, db).delete(id),
        content: (title) => ({
            title,
            slug: title.toLowerCase(),
            fields: { body: title } satisfies JsonObject,
        }),
        save: (draft) => entryDraftRepository.save(draft as never),
        findOne: (id, locale) => entryDraftRepository.findOne(id, locale),
        findMany: (id) => entryDraftRepository.findMany(id),
        delete: (id, locale) => entryDraftRepository.delete(id, locale),
        deleteAll: (id) => entryDraftRepository.deleteAll(id),
        idColumn: 'entryId',
    },
    global: {
        async create() {
            return (
                await createRepository(globalsTable, db).create({
                    key: `site-${++created}`,
                })
            ).id;
        },
        remove: (id) => createRepository(globalsTable, db).delete(id),
        content: (title) => ({ fields: { body: title } satisfies JsonObject }),
        save: (draft) => globalDraftRepository.save(draft as never),
        findOne: (id, locale) => globalDraftRepository.findOne(id, locale),
        findMany: (id) => globalDraftRepository.findMany(id),
        delete: (id, locale) => globalDraftRepository.delete(id, locale),
        deleteAll: (id) => globalDraftRepository.deleteAll(id),
        idColumn: 'globalId',
    },
};

describe.each(Object.entries(ADAPTERS))('%s drafts', (_name, adapter) => {
    function draft(id: string, locale: string, title: string, by: string | null = null) {
        return {
            [adapter.idColumn]: id,
            locale,
            ...adapter.content(title),
            createdBy: by,
            updatedBy: by,
        };
    }

    it('reads back the draft it saved', async () => {
        const id = await adapter.create();
        const author = await createTestUser(db);

        await adapter.save(draft(id, 'en', 'Pending', author.id));

        expect(await adapter.findOne(id, 'en')).toEqual({
            ...draft(id, 'en', 'Pending', author.id),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });
    });

    it('updates the one row on a second save, keeping who created it and when', async () => {
        const id = await adapter.create();
        const author = await createTestUser(db);
        const editor = await createTestUser(db);
        const first = await adapter.save(draft(id, 'en', 'First', author.id));

        const second = await adapter.save(draft(id, 'en', 'Second', editor.id));

        expect(await adapter.findMany(id)).toHaveLength(1);
        expect(second).toMatchObject({
            ...adapter.content('Second'),
            createdBy: author.id,
            updatedBy: editor.id,
            createdAt: first['createdAt'],
        });
        expect((second['updatedAt'] as Date).getTime()).toBeGreaterThanOrEqual(
            (first['updatedAt'] as Date).getTime()
        );
    });

    it('keeps one draft per locale', async () => {
        const id = await adapter.create();
        await adapter.save(draft(id, 'en', 'English'));
        await adapter.save(draft(id, 'de', 'German'));

        expect((await adapter.findMany(id)).map((row) => row['locale'])).toEqual([
            'de',
            'en',
        ]);
        expect(await adapter.findOne(id, 'de')).toMatchObject(adapter.content('German'));

        expect(await adapter.delete(id, 'de')).toBe(true);
        expect(await adapter.delete(id, 'de')).toBe(false);
        expect(await adapter.findOne(id, 'de')).toBeNull();
        expect(await adapter.findOne(id, 'en')).toMatchObject(adapter.content('English'));
    });

    it('deletes every draft of one resource and leaves another resource’s', async () => {
        const id = await adapter.create();
        await adapter.save(draft(id, 'en', 'English'));
        await adapter.save(draft(id, 'de', 'German'));
        const otherId = await adapter.create();
        await adapter.save(draft(otherId, 'en', 'Other'));

        expect(await adapter.deleteAll(id)).toBe(2);
        expect(await adapter.findMany(id)).toEqual([]);
        expect(await adapter.findMany(otherId)).toHaveLength(1);
    });

    it('deletes its drafts when the resource is deleted', async () => {
        const id = await adapter.create();
        await adapter.save(draft(id, 'en', 'English'));
        await adapter.save(draft(id, 'de', 'German'));

        await adapter.remove(id);

        expect(await adapter.findMany(id)).toEqual([]);
    });
});
