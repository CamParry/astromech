/**
 * Storage-level tests for `createEntryMaintenanceStorage` — the whole-table
 * upkeep used by the scheduled-publish and trash-purge CRON jobs.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { createBuiltInEntryStorage } from '@/entries/storage/built-in.js';
import { createEntryMaintenanceStorage } from '@/entries/storage/maintenance.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { trashPurgeJob } from '@/entries/jobs/trash-purge.js';
import { entriesTable } from '@/database/schema.js';
import type { Db } from '@/database/types.js';
import type { ResolvedConfig } from '@/types/index.js';

let db: Db;
let config: ResolvedConfig;
let entryStorage: ReturnType<typeof createBuiltInEntryStorage>;
let maintenance: ReturnType<typeof createEntryMaintenanceStorage>;

beforeEach(async () => {
    db = await createTestDb();
    config = setupTestConfig();
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
        const rawEntries = createStorage(entriesTable, db);
        await rawEntries.update(old.id, {
            deletedAt: new Date(Date.now() - 100_000_000),
        });
        await entryStorage.trash.trash(recent.id);

        const cutoff = new Date(Date.now() - 1000);
        const purged = await maintenance.purgeTrashedBefore(cutoff);
        expect(purged).toEqual([old.id]);

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
        const purged = await maintenance.purgeTrashedBefore(new Date());
        expect(purged).toEqual([]);
        expect(await entryStorage.get(live.id)).not.toBeNull();
    });
});

describe('trashPurgeJob', () => {
    // Relationship rows have no FK to `entries`, so nothing else would clear
    // them: a purged entry would keep both the edges it owned and the edges
    // pointing at it forever.
    it('leaves no relationship rows for a purged entry, in either direction', async () => {
        const doomed = await entryStorage.create({
            type: 'post',
            title: 'Doomed',
            slug: 'doomed',
        });
        const survivor = await entryStorage.create({
            type: 'post',
            title: 'Survivor',
            slug: 'survivor',
        });
        // Backdate past the 30-day retention default the job reads.
        await createStorage(entriesTable, db).update(doomed.id, {
            deletedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        });

        const relationships = createRelationshipStorage(db);
        await relationships.replaceForSource(
            { id: doomed.id, kind: 'entry', type: 'post' },
            [
                {
                    schemaPath: 'related',
                    instancePath: 'related',
                    targetId: survivor.id,
                    targetKind: 'entry',
                },
            ]
        );
        await relationships.replaceForSource(
            { id: survivor.id, kind: 'entry', type: 'post' },
            [
                {
                    schemaPath: 'related',
                    instancePath: 'related[0]',
                    targetId: doomed.id,
                    targetKind: 'entry',
                },
                {
                    schemaPath: 'related',
                    instancePath: 'related[1]',
                    targetId: survivor.id,
                    targetKind: 'entry',
                },
            ]
        );

        await trashPurgeJob.handler({ db, config });

        expect(await entryStorage.get(doomed.id, { includeTrashed: true })).toBeNull();
        expect(await relationships.findBySource(doomed.id, 'entry')).toEqual([]);
        expect(await relationships.findByTarget(doomed.id, 'entry')).toEqual([]);
        // Only edges touching the purged id go: the survivor keeps the rest.
        const kept = await relationships.findBySource(survivor.id, 'entry');
        expect(kept.map((row) => row.targetId)).toEqual([survivor.id]);
    });
});
