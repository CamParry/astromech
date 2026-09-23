/**
 * How a method's arguments travel on a query string, for both halves of the
 * transport: the fetch client writes them and the REST mount reads them back.
 *
 * Scalars are one param each. `sort: { title: 'asc' }` is `sort=title&dir=asc`,
 * and `where: { mimeType: 'image' }` is `where[mimeType]=image`, the bracket form
 * Payload and Strapi use for filters. A list of sorts and a nested filter have
 * no query-string form.
 */

import type { SortDirection } from '@/types/index';

/** `args` as query params: every defined value, stringified. */
export function toQueryParams(args: Record<string, unknown>): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
        if (value === undefined) continue;
        if (key === 'sort') {
            Object.assign(params, sortParams(value));
        } else if (key === 'where' && isRecord(value)) {
            for (const [field, filter] of Object.entries(value)) {
                if (filter !== undefined) params[`where[${field}]`] = String(filter);
            }
        } else {
            params[key] = String(value);
        }
    }
    return params;
}

/**
 * Query params back into arguments: `sort` and `dir` into a `sort` object and
 * `where[...]` into a `where` object. Every other value stays a string.
 */
export function fromQueryParams(query: Record<string, string>): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const where: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
        const filter = /^where\[([^\]]+)\]$/.exec(key)?.[1];
        if (filter !== undefined) where[filter] = value;
        else if (key !== 'sort' && key !== 'dir') args[key] = value;
    }
    const sort = query['sort'];
    if (sort) args['sort'] = { [sort]: (query['dir'] ?? 'desc') as SortDirection };
    if (Object.keys(where).length > 0) args['where'] = where;
    return args;
}

/** The first field and its direction; a list of sorts has no query-string form. */
function sortParams(sort: unknown): Record<string, string> {
    const first = isRecord(sort) ? Object.entries(sort)[0] : undefined;
    return first === undefined ? {} : { sort: first[0], dir: String(first[1]) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
