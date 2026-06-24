import config from 'virtual:astromech/config';
import { flattenEntryFields } from '@/fields/helpers.js';
import { getCurrentUser } from '@/context/index.js';
import { resolveEntryType } from '../type-registry.js';
import { getEntryStorage } from '../storage/registry.js';
import { populateEntries } from '../internal/populate.js';
import { getDefaultLocale, resolveRelatedFields } from '../internal/type-config.js';
import { asEntry } from '../internal/records.js';
import { runPreviewQuery } from './preview/read.js';
import {
    applyVisibilityWithRelations,
    markPublic,
    type VisibilityShape,
} from '../visibility.js';
import type { Entry, EntryQueryParams, QueryResult } from '@/types/index.js';

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

    // Resolve effective visibility shape.
    // Step 4 will layer client-level defaults; absent `full` ⇒ public is correct here.
    const shape: VisibilityShape = params.full ? 'full' : 'public';

    // Populate only applies when all rows share a single type config.
    const singleType = types.length === 1 ? (types[0] ?? null) : null;
    const firstType = types[0] ?? '';
    const storage = getEntryStorage(firstType);

    const singleTypeCfg = singleType ? resolveEntryType(config, singleType) : undefined;

    // Open Q1 (pagination correctness): for public shape, push the status
    // predicate into the storage where-clause so DB counts are correct.
    // WhereFilters supports `status: 'published'` (eq). It does NOT support
    // `publishedAt <= now` (no lte operator) — that check stays in applyVisibility.
    // NOTE: scheduled rows with publishedAt <= now will be counted but then
    // filtered in applyVisibility, slightly inflating total/pages when such rows exist.
    // Only push for types that have the statuses capability; tableStorage-backed
    // types (statuses: false) have no publication status column.
    const hasStatuses = singleTypeCfg
        ? singleTypeCfg.capabilities.statuses !== false
        : true;
    const effectiveWhere =
        shape === 'public' && hasStatuses
            ? { ...params.where, status: 'published' }
            : params.where;

    const { data: rows, total } = await storage.list({
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

    let data = rows.map(asEntry);

    if (singleType && params.populate && params.populate.length > 0) {
        const entryTypeConfig = resolveEntryType(config, singleType);
        if (entryTypeConfig) {
            data = await populateEntries(
                data,
                flattenEntryFields(entryTypeConfig.fields),
                params.populate
            );
        }
    }

    // Apply visibility filter after populate.
    const user = getCurrentUser();
    const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };

    const visibleData: Entry[] = [];
    for (const entry of data) {
        // Resolve field definitions per row (supports cross-type queries).
        const rowType = entry.type ?? singleType ?? firstType;
        // tableStorage-backed rows have no `type` column, so they come back
        // without a type. Stamp it from the query so every returned entry is
        // complete (consumers build links / resolve icons from `entry.type`).
        if (entry.type === undefined) entry.type = rowType;
        const rowTypeCfg = resolveEntryType(config, rowType);
        const rowFields = rowTypeCfg ? flattenEntryFields(rowTypeCfg.fields) : [];

        const filtered = applyVisibilityWithRelations(
            entry,
            { shape, fields: rowFields, audience },
            resolveRelatedFields
        );

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
