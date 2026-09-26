/**
 * What the resource lists share: reading a `sort` against the resource's
 * sortable columns, slicing a `query` call into a page, and the page's schema.
 */

import type { QueryResult, SortOption } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { UnknownSortKeyError } from '@/errors/query';

/** One ORDER BY clause, by field name; the caller maps the name to a column. */
export type SortClause = { field: string; direction: 'asc' | 'desc' };

/** A page slice for a repository `list`; absent means every row. */
export type ListPage = { limit: number; offset: number };

const sortObject = z.record(z.string(), z.enum(['asc', 'desc']));

/**
 * A list call's `sort`: one field→direction map, or a list of them. A value that
 * does not parse as this shape is DROPPED rather than rejected, answering the
 * default order; a well-shaped sort naming an unorderable field answers 400.
 */
export const sortSchema = z
    .union([sortObject, z.array(sortObject)])
    .optional()
    .catch(undefined)
    // `catch` is the one wrapper `@asteasolutions/zod-to-openapi` cannot render,
    // so the OpenAPI shape is stated here. The method manifest still reads the
    // union off the schema itself.
    .openapi({
        type: 'object',
        additionalProperties: { type: 'string', enum: ['asc', 'desc'] },
        description: 'Field → direction, or a list of such objects.',
    });

/** The rows a page asks for when the caller names no limit. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * The ORDER BY clauses a `sort` asks for, or `fallback` when it names none.
 * A field outside `sortable` throws, so a typo answers 400 rather than the
 * default order.
 */
export function buildOrderBy(
    sortable: readonly string[],
    sort: SortOption | SortOption[] | undefined,
    fallback: readonly SortClause[]
): SortClause[] {
    const sorts = sort === undefined ? [] : Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((option) =>
        Object.entries(option).map(([field, direction]): SortClause => {
            if (!sortable.includes(field)) throw new UnknownSortKeyError(field, sortable);
            return { field, direction: direction === 'asc' ? 'asc' : 'desc' };
        })
    );
    return clauses.length > 0 ? clauses : [...fallback];
}

/**
 * Answer a `query` call: every row when `limit` is `'all'`, else one page and
 * the total it belongs to.
 */
export async function queryPage<R>(
    params: { page?: number | undefined; limit?: number | 'all' | undefined },
    read: {
        list: (page?: ListPage) => Promise<R[]>;
        count: () => Promise<number>;
    }
): Promise<QueryResult<R>> {
    if (params.limit === 'all') {
        return { data: await read.list(), pagination: null };
    }
    const page = params.page ?? 1;
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const [data, total] = await Promise.all([
        read.list({ limit, offset: (page - 1) * limit }),
        read.count(),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/** A page's position in the whole list; null in a result when `limit` is `'all'`. */
const paginationSchema = z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
});

/** The output schema of a `query` method: a `QueryResult` of `item`. */
export function queryResultSchema<T extends z.ZodType>(item: T) {
    return z.object({ data: z.array(item), pagination: paginationSchema.nullable() });
}
