/**
 * Storage-level tests for `createEntryMaintenanceStorage` — the whole-table
 * upkeep used by the scheduled-publish and trash-purge CRON jobs.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { createBuiltInEntryStorage } from '@/entries/storage/built-in.js';
import { createEntryMaintenanceStorage } from '@/entries/storage/maintenance.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { entries } from '@/database/schema.js';
import type { Db } from '@/database/types.js';

let db: Db;
let entryStorage: ReturnType<typeof createBuiltInEntryStorage>;
let maintenance: ReturnType<typeof createEntryMaintenanceStorage>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    entryStorage = createBuiltInEntryStorage();
    maintenance = createEntryMaintenanceStorage(db);
});

describe('publishDueScheduled', () => {
    it('publishes every due entry in a single batch and leaves the rest untouched', async () => {
        const past = new Date(Date.now() - 60_000);
        const future = new Date(Date.now() + 60_000);

        const due1 = await entryStorage.create({
            type: 'post',
            title: 'Due 1',
            slug: 'due-1',
            status: 'scheduled',
            publishedAt: past,
        });
        const due2 = await entryStorage.create({
            type: 'post',
            title: 'Due 2',
            slug: 'due-2',
            status: 'scheduled',
            publishedAt: past,
        });
        const notDue = await entryStorage.create({
            type: 'post',
            title: 'Not due',
            slug: 'not-due',
            status: 'scheduled',
            publishedAt: future,
        });
        const alreadyPublished = await entryStorage.create({
            type: 'post',
            title: 'Already',
            slug: 'already',
            status: 'published',
            publishedAt: past,
        });

        const count = await maintenance.publishDueScheduled(new Date());
        expect(count).toBe(2);

        expect((await entryStorage.get(due1.id))?.status).toBe('published');
        expect((await entryStorage.get(due2.id))?.status).toBe('published');
        expect((await entryStorage.get(notDue.id))?.status).toBe('scheduled');
        expect((await entryStorage.get(alreadyPublished.id))?.status).toBe('published');
    });

    it('excludes trashed entries even if their publish time has passed', async () => {
        const past = new Date(Date.now() - 60_000);
        const trashed = await entryStorage.create({
            type: 'post',
            title: 'Trashed',
            slug: 'trashed',
            status: 'scheduled',
            publishedAt: past,
        });
        await entryStorage.trash.trash(trashed.id);

        const count = await maintenance.publishDueScheduled(new Date());
        expect(count).toBe(0);
    });
});

describe('purgeTrashedBefore', () => {
    it('hard-deletes only entries trashed on or before the cutoff', async () => {
        const old = await entryStorage.create({
            type: 'post',
            title: 'Old',
            slug: 'old',
        });
        const recent = await entryStorage.create({
            type: 'post',
            title: 'Recent',
            slug: 'recent',
        });

        // Backdate `old`'s deletedAt directly — trash() always stamps "now".
        const rawEntries = createStorage(entries, db);
        await rawEntries.update(old.id, {
            deletedAt: new Date(Date.now() - 100_000_000),
        });
        await entryStorage.trash.trash(recent.id);

        const cutoff = new Date(Date.now() - 1000);
        const count = await maintenance.purgeTrashedBefore(cutoff);
        expect(count).toBe(1);

        expect(await entryStorage.get(old.id, { includeTrashed: true })).toBeNull();
        expect(
            await entryStorage.get(recent.id, { includeTrashed: true })
        ).not.toBeNull();
    });

    it('leaves live (non-trashed) entries alone', async () => {
        const live = await entryStorage.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        const count = await maintenance.purgeTrashedBefore(new Date());
        expect(count).toBe(0);
        expect(await entryStorage.get(live.id)).not.toBeNull();
    });
});
