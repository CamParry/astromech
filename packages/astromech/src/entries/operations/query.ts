import type { VisibilityShape } from '../visibility';
import type {
    Entry,
    EntryQueryParams,
    QueryResult,
    ReferencesFilter,
} from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { collectRelationshipSchemaPaths } from '@/fields/relationship-edges';
import { getCurrentUser } from '@/request-context/index';
import { InvalidReferencesFilterError, PublicTrashedReadError } from '../errors';
import { asEntry } from '../internal/records';
import { getDefaultLocale } from '../internal/type-config';
import { getEntryRepository } from '../repository/registry';
import { applyVisibility, markPublic } from '../visibility';
import { runPreviewQuery } from './preview/read';

/**
 * Lists entries of one or more types, paginated and filtered to the caller's
 * visibility shape. A `previewToken` takes the preview path; a public read of
 * trashed rows throws, since the public shape can never return them.
 */
export async function query(
    params: EntryQueryParams & { type: string | readonly string[] }
): Promise<QueryResult<Entry>> {
    // Preview (forward versioning): token-authorized read that bypasses the
    // publish gate. Public shape only; diverges enough to take its own path.
    if (params.previewToken) return runPreviewQuery(params);

    const typeParam = params.type;
    const types = Array.isArray(typeParam)
        ? Array.from(typeParam)
        : [typeParam as string];

    // Absent `full` ⇒ public.
    const shape: VisibilityShape = params.full ? 'full' : 'public';

    // A public read can never return a trashed row: the public shape forces
    // `status: 'published'` below and `applyVisibility` drops every trashed row
    // afterwards. Asking for both would yield an empty list indistinguishable
    // from "nothing is trashed", so reject it instead.
    if (params.trashed === true && shape === 'public') throw new PublicTrashedReadError();

    // A single type resolves one config; a cross-type query resolves per row.
    const singleType = types.length === 1 ? (types[0] ?? null) : null;
    const firstType = types[0] ?? '';
    const repository = getEntryRepository(firstType);

    const singleTypeCfg = singleType
        ? resolveEntryType(getConfig(), singleType)
        : undefined;

    // For the public shape, push the status predicate into the repository
    // where-clause so DB counts are correct. WhereFilters supports
    // `status: 'published'` (eq) but not `publishedAt <= now` (no lte operator),
    // so that check stays in applyVisibility — scheduled rows with
    // `publishedAt <= now` are counted here and filtered there, slightly
    // inflating total/pages when such rows exist. Only push for types with the
    // statuses capability; tableRepository-backed types have no status column.
    const hasStatuses = singleTypeCfg
        ? singleTypeCfg.capabilities.statuses !== false
        : true;
    const effectiveWhere =
        shape === 'public' && hasStatuses
            ? { ...params.where, status: 'published' }
            : params.where;

    const references = params.where?.['references'];
    if (references !== undefined) assertReferencesFilter(references, types);

    const { data: rows, total } = await repository.list({
        type: singleType ?? types,
        locale: params.locale ?? getDefaultLocale(),
        trashed: params.trashed ?? false,
        search: params.search,
        ...(singleTypeCfg?.search ? { searchFields: singleTypeCfg.search } : {}),
        where: effectiveWhere,
        sort: params.sort,
        page: params.page ?? 1,
        limit: params.limit,
    });

    const data = rows.map(asEntry);

    const user = await getCurrentUser();
    const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };

    const visibleData: Entry[] = [];
    for (const entry of data) {
        // Resolve field definitions per row (supports cross-type queries).
        const rowType = entry.type ?? singleType ?? firstType;
        // tableRepository-backed rows have no `type` column, so they come back
        // without a type. Stamp it from the query so every returned entry is
        // complete (consumers build links / resolve icons from `entry.type`).
        if (entry.type === undefined) entry.type = rowType;
        const rowEntryType = resolveEntryType(getConfig(), rowType);
        const rowFields = rowEntryType ? flattenEntryFields(rowEntryType.fields) : [];

        const filtered = applyVisibility(entry, {
            shape,
            fields: rowFields,
            audience,
        });

        if (filtered !== null) {
            visibleData.push(shape === 'public' ? markPublic(filtered) : filtered);
        }
    }

    if (params.limit === 'all') {
        return { data: visibleData, pagination: null };
    }

    const perPage = typeof params.limit === 'number' ? params.limit : 20;
    const page = params.page ?? 1;
    const pages = Math.ceil(total / perPage);

    return {
        data: visibleData,
        pagination: { page, limit: perPage, total, pages },
    };
}

/**
 * Check `where: { references }` against the queried types' schemas before it
 * reaches the repository. One type declaring the path is enough — a cross-type query
 * is legal and requiring every type to declare it would reject valid reads.
 */
function assertReferencesFilter(value: unknown, types: string[]): void {
    const filter = value as Partial<ReferencesFilter> | null;
    const path = typeof filter?.path === 'string' ? filter.path : '';
    const id = typeof filter?.id === 'string' ? filter.id : '';

    const knownPaths = Array.from(
        new Set(
            types.flatMap((type) => {
                const typeConfig = resolveEntryType(getConfig(), type);
                return typeConfig
                    ? collectRelationshipSchemaPaths(
                          flattenEntryFields(typeConfig.fields)
                      )
                    : [];
            })
        )
    );

    if (path === '' || id === '') {
        throw new InvalidReferencesFilterError({
            detail: `where.references needs a non-empty 'path' and 'id'.`,
            entryTypes: types,
            knownPaths,
        });
    }

    if (!knownPaths.includes(path)) {
        throw new InvalidReferencesFilterError({
            detail: `where.references.path '${path}' is not a relationship field on any queried type.`,
            entryTypes: types,
            knownPaths,
        });
    }
}
