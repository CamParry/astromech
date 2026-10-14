/**
 * The shared drafts group: the pending changes to a published locale, at most
 * one row per resource and locale (`decisions/published-content-changes-through-a-draft.md`).
 * Parameterized over the drafts table and its resource-id column, so entries
 * and globals share one implementation.
 *
 * Every statement binds one resource id and at most one locale, so none comes
 * near D1's bound-parameter cap.
 */

import type { JoinedWhere } from './types';
import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import type { OrderBy, Patch } from '@/database/repository/create-repository';
import type { Where } from '@/database/repository/where';
import type { Db } from '@/database/types';
import { decodeWith, encodeUpdateWith, encodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { AstromechError } from '@/errors/astromech-error';

/** The columns the first save of a draft sets and a later save keeps. */
const FIRST_SAVE_COLUMNS = new Set(['createdAt', 'createdBy']);

/**
 * What a guarded save requires: whether it replaces a draft it read or makes
 * the first, and a condition the write carries in its own statement, such as
 * `ContentRepository.guardHolds`.
 */
export type DraftSaveGuard = {
    /** True when the save read a draft and replaces it; false when it makes the first. */
    replaces: boolean;
    holds: JoinedWhere;
};

export type DraftsRepository<D extends Table> = {
    /** The draft of one locale of one resource, or null when it has none. */
    findOne(id: string, locale: string): Promise<TableSelect<D> | null>;
    /** Every draft of one resource, ordered by locale. */
    findMany(id: string): Promise<TableSelect<D>[]>;
    /**
     * Write a locale's draft, creating it on the first save. A later save
     * replaces the columns it names and keeps the first save's `createdAt` and
     * `createdBy`; a column it leaves out keeps its stored value.
     */
    save(draft: TableInsert<D>): Promise<TableSelect<D>>;
    /**
     * The same write in one statement, only while `guard.holds`: an update of
     * the draft it read, or an insert that finds the locale without one. Null
     * when nothing was written.
     */
    save(draft: TableInsert<D>, guard: DraftSaveGuard): Promise<TableSelect<D> | null>;
    /** Delete one locale's draft. Answers whether there was one. */
    delete(id: string, locale: string): Promise<boolean>;
    /** Delete every draft of one resource. Answers how many there were. */
    deleteAll(id: string): Promise<number>;
};

/**
 * `table` is keyed by `(resourceIdColumn, locale)`: `entry_drafts` by
 * `entryId`, `global_drafts` by `globalId`.
 */
export function createDraftsRepository<D extends Table>(
    table: D,
    resourceIdColumn: keyof TableSelect<D> & string,
    db?: Db
): DraftsRepository<D> {
    const key = [resourceIdColumn, 'locale'];
    if (table.primaryKey?.join() !== key.join()) {
        throw new AstromechError(
            `createDraftsRepository("${table.name}"): the table must be keyed by ` +
                `(${key.join(', ')})`
        );
    }
    // Pass `db` straight through, as the versions group does: the handle
    // resolves per call, so it follows an open transaction scope.
    const repository = createRepository(table, db);

    /** The one cast from a column chosen at runtime to the table's `where`. */
    function whereOf(id: string, locale?: string): Where<D> {
        return {
            [resourceIdColumn]: id,
            ...(locale !== undefined && { locale }),
        };
    }

    async function findOne(id: string, locale: string): Promise<TableSelect<D> | null> {
        return repository.findOne(whereOf(id, locale));
    }

    async function findMany(id: string): Promise<TableSelect<D>[]> {
        return repository.findMany({
            where: whereOf(id),
            orderBy: [['locale', 'asc']] as OrderBy<D>,
        });
    }

    /** The columns a later save writes: all but the key and the first save's. */
    function laterSaveColumns(draft: TableInsert<D>): Record<string, unknown> {
        const set: Record<string, unknown> = {};
        for (const [column, value] of Object.entries(draft)) {
            if (!key.includes(column) && !FIRST_SAVE_COLUMNS.has(column)) {
                set[column] = value;
            }
        }
        return set;
    }

    function save(draft: TableInsert<D>): Promise<TableSelect<D>>;
    function save(
        draft: TableInsert<D>,
        guard: DraftSaveGuard
    ): Promise<TableSelect<D> | null>;
    async function save(
        draft: TableInsert<D>,
        guard?: DraftSaveGuard
    ): Promise<TableSelect<D> | null> {
        if (guard === undefined) {
            return repository.upsert(draft, { set: laterSaveColumns(draft) as Patch<D> });
        }
        const { db, table: tableKey } = repository.kysely();
        const values = draft as Record<string, unknown>;
        const row = guard.replaces
            ? await db
                  .updateTable(tableKey)
                  .set(encodeUpdateWith(table, laterSaveColumns(draft)) as never)
                  .where((eb) =>
                      eb.and([
                          eb(resourceIdColumn, '=', values[resourceIdColumn] as never),
                          eb('locale', '=', values['locale'] as never),
                          guard.holds(eb),
                      ])
                  )
                  .returningAll()
                  .executeTakeFirst()
            : await insertWhere(encodeWith(table, values), guard);
        return row === undefined ? null : decodeWith(table, row);
    }

    /**
     * `INSERT ... SELECT <values> WHERE <holds>`, doing nothing when the locale
     * has a draft already. SQLite parses an upsert after a `SELECT` only when the
     * `SELECT` has a `WHERE`, which `holds` always gives it.
     */
    async function insertWhere(
        encoded: Record<string, unknown>,
        guard: DraftSaveGuard
    ): Promise<Record<string, unknown> | undefined> {
        const { db, table: tableKey } = repository.kysely();
        const columns = Object.keys(encoded);
        const select = db
            .selectNoFrom((eb) =>
                columns.map((column) => eb.val(encoded[column]).as(column))
            )
            .where(guard.holds);
        return db
            .insertInto(tableKey)
            .columns(columns)
            .expression(select as never)
            .onConflict((oc) => oc.columns(key).doNothing())
            .returningAll()
            .executeTakeFirst();
    }

    async function del(id: string, locale: string): Promise<boolean> {
        return (await repository.deleteMany(whereOf(id, locale))) > 0;
    }

    async function deleteAll(id: string): Promise<number> {
        return repository.deleteMany(whereOf(id));
    }

    return { findOne, findMany, save, delete: del, deleteAll };
}
