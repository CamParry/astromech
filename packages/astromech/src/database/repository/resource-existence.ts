/**
 * Existence checks for the three targetable resources (entry, user, media).
 * Lives in `database/` so any module can ask without importing a
 * peer service. Answers only "does this row exist" — no visibility, no shaping.
 */

import type { Db } from '@/database/types';
import type { TargetKind } from '@/fields/relationship-edges';
import { getDb } from '@/database/registry';

/** D1 caps a query at 100 bound parameters, and each id binds one. */
const ID_CHUNK = 100;

/**
 * Which of these ids actually exist. Ids absent from the result do not.
 *
 * Entries include trashed and staged rows: a trashed entry still exists, and
 * neither state may make a reference to it read as dangling.
 */
export async function existingResourceIds(
    kind: TargetKind,
    ids: string[],
    db?: Db
): Promise<Set<string>> {
    const database = db ?? getDb();
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Set();

    const found = new Set<string>();
    for (let i = 0; i < unique.length; i += ID_CHUNK) {
        for (const id of await selectIds(database, kind, unique.slice(i, i + ID_CHUNK))) {
            found.add(id);
        }
    }
    return found;
}

/**
 * The entry type each of these ids resolves to, keyed by id. Ids absent from the
 * result have no row in the `entries` table — dangling, or held by a storage
 * override — and the caller decides what that means.
 */
export async function existingEntryTypes(
    ids: string[],
    db?: Db
): Promise<Map<string, string>> {
    const database = db ?? getDb();
    const unique = Array.from(new Set(ids));
    const types = new Map<string, string>();
    for (let i = 0; i < unique.length; i += ID_CHUNK) {
        const rows = await database
            .selectFrom('entries')
            .select(['id', 'type'])
            .where('id', 'in', unique.slice(i, i + ID_CHUNK))
            .execute();
        for (const row of rows) types.set(row.id, row.type);
    }
    return types;
}

/** One `WHERE id IN (…)` against the table that owns `kind`. */
async function selectIds(db: Db, kind: TargetKind, ids: string[]): Promise<string[]> {
    switch (kind) {
        case 'entry': {
            const rows = await db
                .selectFrom('entries')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
        case 'user': {
            const rows = await db
                .selectFrom('users')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
        case 'media': {
            const rows = await db
                .selectFrom('media')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
    }
}
