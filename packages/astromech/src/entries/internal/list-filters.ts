import type { ListParams } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import type { ResolvedConfig, WhereFilters } from '@/types/index';
import { hasStatuses } from '@/content/resources';
import { sharedSortableFields } from '@/entries/sort-fields';

/**
 * The repository filters for the rows a list read returns: `query` lists them
 * and `count` counts them. A public read keeps the rows `isPubliclyVisible`
 * (`content/visibility.ts`) passes as of `now`, so a count matches the rows.
 * `sortableFields` holds the fields every listed type may be ordered by.
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
    // A type without statuses stores `unpublished` on every row, and every row is live.
    const typesWithoutStatuses = types.filter(
        (type) => !hasStatuses('entry', config, type)
    );
    const filtersPublished =
        shape === 'public' && typesWithoutStatuses.length < types.length;
    return {
        type: singleType ?? types,
        locale: params.locale,
        trashed: params.trashed ?? false,
        search: params.search,
        sortableFields: sharedSortableFields(config, types, shape),
        // A public read decides the status itself, so a caller's status filter is dropped.
        where: filtersPublished ? withoutStatus(where) : where,
        ...(filtersPublished
            ? { publiclyVisible: { asOf: now, typesWithoutStatuses } }
            : {}),
    };
}

function withoutStatus(where: WhereFilters | undefined): WhereFilters | undefined {
    if (where === undefined) return undefined;
    return Object.fromEntries(Object.entries(where).filter(([key]) => key !== 'status'));
}
