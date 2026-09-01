/**
 * Repository-level tests for `createEntryMaintenanceRepository` — the whole-table
 * upkeep used by the scheduled-publish and trash-purge CRON jobs.
 */

import type { Db } from '@/database/types';
import type { ResolvedConfig } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { entriesTable } from '@/database/tables';
import { trashPurgeJob } from '@/entries/jobs/trash-purge';
import { createEntriesTableRepository } from '@/entries/repository/entries-table';
import { createEntryMaintenanceRepository } from '@/entries/repository/maintenance';

let db: Db;
let config: ResolvedConfig;
let entryRepository: ReturnType<typeof createEntriesTableRepository>;
let maintenance: ReturnType<typeof createEntryMaintenanceRepository>;

beforeEach(async () => {
    db = await createTestDb();
    config = setupTestConfig();
    entryRepository = createEntriesTableRepository();
    maintenance = createEntryMaintenanceRepository(db);
});

describe('publishDueScheduled', () => {
    it('publishes every due entry in a single batch and leaves the rest untouched', async () => {
        const past = new Date(Date.now() - 60_000);
        const future = new Date(Date.now() + 60_000);

        const due1 = await entryRepository.create({
            type: 'post',
            title: 'Due 1',
            slug: 'due-1',
            status: 'scheduled',
            publishedAt: past,
        });
        const due2 = await entryRepository.create({
            type: 'post',
            title: 'Due 2',
            slug: 'due-2',
            status: 'scheduled',
            publishedAt: past,
        });
        const notDue = await entryRepository.create({
            type: 'post',
            title: 'Not due',
            slug: 'not-due',
            status: 'scheduled',
            publishedAt: future,
        });
        const alreadyPublished = await entryRepository.create({
            type: 'post',
            title: 'Already',
            slug: 'already',
            status: 'published',
            publishedAt: past,
        });

        const count = await maintenance.publishDueScheduled(new Date());
        expect(count).toBe(2);

        expect((await entryRepository.get({ id: due1.id }))?.status).toBe('published');
        expect((await entryRepository.get({ id: due2.id }))?.status).toBe('published');
        expect((await entryRepository.get({ id: notDue.id }))?.status).toBe('scheduled');
        expect((await entryRepository.get({ id: alreadyPublished.id }))?.status).toBe(
            'published'
        );
    });

    it('publishes each due locale independently', async () => {
        const past = new Date(Date.now() - 60_000);
        const entry = await entryRepository.create({
            type: 'post',
            title: 'EN',
            slug: 'en-due',
            status: 'scheduled',
            publishedAt: past,
        });
        await entryRepository.update(
            { id: entry.id, locale: 'de' },
            { title: 'DE', slug: 'de-not-due', status: 'unpublished' }
        );

        expect(await maintenance.publishDueScheduled(new Date())).toBe(1);

        expect((await entryRepository.get({ id: entry.id }))?.status).toBe('published');
        expect((await entryRepository.get({ id: entry.id, locale: 'de' }))?.status).toBe(
            'unpublished'
        );
    });

    it('leaves a due staged row scheduled: it publishes at its merge', async () => {
        const past = new Date(Date.now() - 60_000);
        const entry = await entryRepository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
            status: 'unpublished',
        });
        await entryRepository.staging.create(
            { id: entry.id },
            { title: 'Staged', slug: 'live', status: 'scheduled', publishedAt: past }
        );

        expect(await maintenance.publishDueScheduled(new Date())).toBe(0);

        const staged = await entryRepository.staging.getByCanonical(entry.id);
        expect(staged?.status).toBe('scheduled');
        expect((await entryRepository.get({ id: entry.id }))?.status).toBe('unpublished');
    });

    it('excludes trashed entries even if their publish time has passed', async () => {
        const past = new Date(Date.now() - 60_000);
        const trashed = await entryRepository.create({
            type: 'post',
            title: 'Trashed',
            slug: 'trashed',
            status: 'scheduled',
            publishedAt: past,
        });
        await entryRepository.trash.trash(trashed.id);

        const count = await maintenance.publishDueScheduled(new Date());
        expect(count).toBe(0);
    });
});

describe('purgeTrashedBefore', () => {
    it('hard-deletes only entries trashed on or before the cutoff', async () => {
        const old = await entryRepository.create({
            type: 'post',
            title: 'Old',
            slug: 'old',
        });
        const recent = await entryRepository.create({
            type: 'post',
            title: 'Recent',
            slug: 'recent',
        });

        // Backdate `old`'s deletedAt directly — trash() always stamps "now".
        const rawEntries = createRepository(entriesTable, db);
        await rawEntries.update(old.id, {
            deletedAt: new Date(Date.now() - 100_000_000),
        });
        await entryRepository.trash.trash(recent.id);

        const cutoff = new Date(Date.now() - 1000);
        const purged = await maintenance.purgeTrashedBefore(cutoff);
        expect(purged).toEqual([old.id]);

        expect(
            await entryRepository.get({ id: old.id }, { includeTrashed: true })
        ).toBeNull();
        expect(
            await entryRepository.get({ id: recent.id }, { includeTrashed: true })
        ).not.toBeNull();
    });

    it('leaves live (non-trashed) entries alone', async () => {
        const live = await entryRepository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        const purged = await maintenance.purgeTrashedBefore(new Date());
        expect(purged).toEqual([]);
        expect(await entryRepository.get({ id: live.id })).not.toBeNull();
    });
});

describe('trashPurgeJob', () => {
    // Relationship rows have no FK to `entries`, so nothing else would clear
    // them: a purged entry would keep both the edges it owned and the edges
    // pointing at it forever.
    it('leaves no relationship rows for a purged entry, in either direction', async () => {
        const doomed = await entryRepository.create({
            type: 'post',
            title: 'Doomed',
            slug: 'doomed',
        });
        const survivor = await entryRepository.create({
            type: 'post',
            title: 'Survivor',
            slug: 'survivor',
        });
        // Backdate past the 30-day retention default the job reads.
        await createRepository(entriesTable, db).update(doomed.id, {
            deletedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        });

        const relationships = createRelationshipRepository(db);
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

        expect(
            await entryRepository.get({ id: doomed.id }, { includeTrashed: true })
        ).toBeNull();
        expect(await relationships.findBySource(doomed.id, 'entry')).toEqual([]);
        expect(await relationships.findByTarget(doomed.id, 'entry')).toEqual([]);
        // Only edges touching the purged id go: the survivor keeps the rest.
        const kept = await relationships.findBySource(survivor.id, 'entry');
        expect(kept.map((row) => row.targetId)).toEqual([survivor.id]);
    });
});
