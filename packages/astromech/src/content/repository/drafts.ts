/**
 * The shared drafts group: the pending changes to a published locale, at most
 * one row per resource and locale (`decisions/published-content-changes-through-a-draft.md`).
 * Parameterized over the drafts table and its resource-id column, so entries
 * and globals share one implementation.
 *
 * Every statement binds one resource id and at most one locale, so none comes
 * near D1's bound-parameter cap.
 */

import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import type { OrderBy, Patch } from '@/database/repository/create-repository';
import type { Where } from '@/database/repository/where';
import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import { AstromechError } from '@/errors/astromech-error';

/** The columns the first save of a draft sets and a later save keeps. */
const FIRST_SAVE_COLUMNS = new Set(['createdAt', 'createdBy']);

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

    async function save(draft: TableInsert<D>): Promise<TableSelect<D>> {
        const set: Record<string, unknown> = {};
        for (const [column, value] of Object.entries(draft)) {
            if (!key.includes(column) && !FIRST_SAVE_COLUMNS.has(column)) {
                set[column] = value;
            }
        }
        return repository.upsert(draft, { set: set as Patch<D> });
    }

    async function del(id: string, locale: string): Promise<boolean> {
        return (await repository.deleteMany(whereOf(id, locale))) > 0;
    }

    async function deleteAll(id: string): Promise<number> {
        return repository.deleteMany(whereOf(id));
    }

    return { findOne, findMany, save, delete: del, deleteAll };
}
