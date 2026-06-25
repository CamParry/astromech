/**
 * Version storage — CRUD for entry version-history snapshots. Wrapped by the
 * built-in entry storage's `versions` capability group.
 */

import type { Insertable } from 'kysely';
import { getDb } from '@/database/registry.js';
import { encode, decode } from '@/database/codec.js';
import type { DB, Db } from '@/database/types.js';
import type { EntryVersionRow, NewEntryVersionRow } from '../schema.js';

export type VersionStorage = ReturnType<typeof createVersionStorage>;

export function createVersionStorage(db: Db = getDb()) {
    /** Create a new version snapshot. */
    async function create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        const created = await db
            .insertInto('entryVersions')
            .values(
                encode(
                    'entryVersions',
                    data as unknown as Record<string, unknown>
                ) as unknown as Insertable<DB['entryVersions']>
            )
            .returningAll()
            .executeTakeFirstOrThrow();
        return decode('entryVersions', created) as unknown as EntryVersionRow;
    }

    /** Get all versions for an entry, newest first. */
    async function list(entryId: string): Promise<EntryVersionRow[]> {
        const rows = await db
            .selectFrom('entryVersions')
            .selectAll()
            .where('entryId', '=', entryId)
            .orderBy('versionNumber', 'desc')
            .execute();
        return rows.map((r) =>
            decode('entryVersions', r)
        ) as unknown as EntryVersionRow[];
    }

    /** Get a single version by ID. */
    async function get(id: string): Promise<EntryVersionRow | null> {
        const row = await db
            .selectFrom('entryVersions')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        return row ? (decode('entryVersions', row) as unknown as EntryVersionRow) : null;
    }

    /** Get the highest version number for an entry (0 if no versions exist). */
    async function getLatestNumber(entryId: string): Promise<number> {
        const r = await db
            .selectFrom('entryVersions')
            .select((eb) => eb.fn.max('versionNumber').as('m'))
            .where('entryId', '=', entryId)
            .executeTakeFirst();
        return Number(r?.m ?? 0);
    }

    /** Delete oldest versions beyond a retention limit (for CRON trimming). */
    async function deleteExcess(entryId: string, keep: number): Promise<void> {
        const versions = await list(entryId);
        const toDelete = versions.slice(keep);
        for (const version of toDelete) {
            await db.deleteFrom('entryVersions').where('id', '=', version.id).execute();
        }
    }

    return { create, list, get, getLatestNumber, deleteExcess };
}
