import type { ListParams } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import type { ResolvedConfig } from '@/types/index';
import { resolveEntryType } from '@/entries/entry-types';

/**
 * The repository filters for the rows a list read returns: `query` lists them
 * and `count` counts them. A public read of a type with statuses keeps only
 * rows published as of `now`, so a count matches the rows.
 */
export function entryListFilters(
    config: ResolvedConfig,
    params: Pick<ListParams, 'locale' | 'search' | 'where'> & {
        types: readonly string[];
        trashed?: boolean | undefined;
        shape: VisibilityShape;
    },
    now: Date
): ListParams {
    const { types, where, shape } = params;
    const singleType = types.length === 1 ? (types[0] ?? null) : null;
    const entryType = singleType ? resolveEntryType(config, singleType) : undefined;
    // A type without statuses has neither the status nor the publish column.
    const hasStatuses = entryType ? entryType.capabilities.statuses !== false : true;
    const filtersPublished = shape === 'public' && hasStatuses;
    return {
        type: singleType ?? types,
        locale: params.locale,
        trashed: params.trashed ?? false,
        search: params.search,
        where: filtersPublished ? { ...where, status: 'published' } : where,
        ...(filtersPublished ? { publishedAsOf: now } : {}),
    };
}
