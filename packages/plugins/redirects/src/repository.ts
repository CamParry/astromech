/**
 * The redirect-rule repository: the one place this plugin's table meets the
 * database. Built per call from `ctx.db`, so a write joins an open transaction.
 */

import type { NewRedirectRow, RedirectRow } from './tables/redirects';
import type { Patch, PluginContext, SortOption, Where } from 'astromech';
import { createRepository } from 'astromech';
import { redirectsTable } from './tables/redirects';

/** A partial write against a rule. */
type RedirectPatch = Patch<typeof redirectsTable>;

/** The columns a list may sort on. */
export const REDIRECT_SORTABLE = [
    'from',
    'to',
    'status',
    'enabled',
    'createdAt',
    'updatedAt',
] as const;

/** One of {@link REDIRECT_SORTABLE}. */
type RedirectSortKey = (typeof REDIRECT_SORTABLE)[number];

/** A list read: a search over `from` and `to`, a sort, and a page slice. */
type RedirectListParams = {
    search?: string | undefined;
    sort?: SortOption | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

export type RedirectsRepository = ReturnType<typeof createRedirectsRepository>;

/** The rule repository over `redirectsTable`, on the handle `db`. */
export function createRedirectsRepository(db: PluginContext['db']) {
    const repository = createRepository(redirectsTable, db);

    /** By id; `null` when there is no such rule. */
    async function findOne(id: string): Promise<RedirectRow | null> {
        return repository.findOne({ id });
    }

    /** The rule for a request path, read through the unique index on `from`. */
    async function findByFrom(path: string): Promise<RedirectRow | null> {
        return repository.findOne({ from: path });
    }

    /** Every rule that sends a visitor to `path`. */
    async function findByTo(path: string): Promise<RedirectRow[]> {
        return repository.findMany({ where: { to: path } });
    }

    /** One page of rules, ordered by `sort` or by `from`. */
    async function findMany(params: RedirectListParams = {}): Promise<RedirectRow[]> {
        return repository.findMany({
            where: searchWhere(params.search),
            orderBy: orderBy(params.sort),
            ...(params.limit !== undefined && { limit: params.limit }),
            ...(params.offset !== undefined && { offset: params.offset }),
        });
    }

    /** How many rules match the search. */
    async function count(params: Pick<RedirectListParams, 'search'> = {}) {
        return repository.count(searchWhere(params.search));
    }

    async function create(values: NewRedirectRow): Promise<RedirectRow> {
        return repository.create(values);
    }

    /** The saved rule, or `null` when there is no rule with that id. */
    async function update(id: string, patch: RedirectPatch): Promise<RedirectRow | null> {
        const updated = await repository.updateMany({ id }, patch);
        return updated > 0 ? findOne(id) : null;
    }

    /** Whether a rule was removed. */
    async function del(id: string): Promise<boolean> {
        return (await repository.deleteMany({ id })) > 0;
    }

    return {
        findOne,
        findByFrom,
        findByTo,
        findMany,
        count,
        create,
        update,
        delete: del,
    };
}

/** A search matches a substring of `from` or `to`; an empty one matches every rule. */
function searchWhere(search: string | undefined): Where<typeof redirectsTable> {
    if (search === undefined || search === '') return {};
    return { or: [{ from: { contains: search } }, { to: { contains: search } }] };
}

/** The ORDER BY for a sort, with `id` last so pages never overlap. */
function orderBy(sort: SortOption | undefined) {
    const clauses = Object.entries(sort ?? {})
        .filter((entry): entry is [RedirectSortKey, 'asc' | 'desc'] =>
            (REDIRECT_SORTABLE as readonly string[]).includes(entry[0])
        )
        .map(([key, direction]) => [key, direction] as const);
    const primary = clauses.length > 0 ? clauses : [['from', 'asc'] as const];
    return [...primary, ['id', 'asc'] as const];
}
