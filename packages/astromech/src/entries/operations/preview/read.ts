/**
 * Preview reads (forward versioning). Resolve canonicals matching the filters
 * WITHOUT the publish gate, verify the token against each, optionally swap to
 * the staged change, and return the preview (public) shape. Unauthorized/absent
 * token → empty result (the front-end renders a 404).
 */

import config from 'virtual:astromech/config';
import { flattenEntryFields } from '@/fields/helpers.js';
import { resolveEntryType } from '../../type-registry.js';
import { getEntryStorage } from '../../storage/registry.js';
import { populateEntries } from '../../internal/populate.js';
import { getDefaultLocale } from '../../internal/type-config.js';
import { asEntry } from '../../internal/records.js';
import { verifyPreviewToken, projectPreview } from '../../internal/preview.js';
import type { Entry, EntryQueryParams, QueryResult } from '@/types/index.js';

export async function runPreviewQuery(
    params: EntryQueryParams & { type: string | readonly string[] }
): Promise<QueryResult<Entry>> {
    const perPage = typeof params.limit === 'number' ? params.limit : 20;
    const empty: QueryResult<Entry> = {
        data: [],
        pagination:
            params.limit === 'all'
                ? null
                : { page: params.page ?? 1, limit: perPage, total: 0, pages: 0 },
    };

    const token = params.previewToken;
    const typeParam = params.type;
    const type = Array.isArray(typeParam) ? typeParam[0] : (typeParam as string);
    if (!token || !type) return empty;

    const storage = getEntryStorage(type);
    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    const { data: rows } = await storage.list({
        type,
        locale: params.locale ?? getDefaultLocale(),
        where: params.where,
        sort: params.sort,
        limit: params.limit ?? 1,
        page: params.page ?? 1,
    });

    const out: Entry[] = [];
    for (const row of rows) {
        const canonical = asEntry(row);
        if (!(await verifyPreviewToken(canonical.id, token))) continue;

        let target: Entry = canonical;
        if (params.staged) {
            const staged = await storage.staging?.getByCanonical(canonical.id);
            if (!staged) continue;
            target = asEntry(staged);
        }

        let result = target;
        if (params.populate && params.populate.length > 0 && entryTypeCfg) {
            const populated = await populateEntries([result], fields, params.populate);
            result = populated[0] ?? result;
        }

        const projected = projectPreview(result, fields);
        if (projected !== null) out.push(projected);
    }

    if (params.limit === 'all') return { data: out, pagination: null };
    return {
        data: out,
        pagination: {
            page: params.page ?? 1,
            limit: perPage,
            total: out.length,
            pages: out.length > 0 ? 1 : 0,
        },
    };
}

/** Preview single read by canonical id (see runPreviewQuery). */
export async function runPreviewGet(
    type: string,
    id: string,
    params: { populate?: string[]; previewToken?: string; staged?: boolean }
): Promise<Entry | null> {
    const token = params.previewToken;
    if (!token) return null;

    const storage = getEntryStorage(type);
    const record = await storage.get(id); // excludes trashed
    if (!record) return null;
    if (record.type !== undefined && record.type !== type) return null;

    const canonical = asEntry(record);
    if (!(await verifyPreviewToken(canonical.id, token))) return null;

    let target: Entry = canonical;
    if (params.staged) {
        const staged = await storage.staging?.getByCanonical(canonical.id);
        if (!staged) return null;
        target = asEntry(staged);
    }

    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    let result = target;
    if (params.populate && params.populate.length > 0 && entryTypeCfg) {
        const populated = await populateEntries([result], fields, params.populate);
        result = populated[0] ?? result;
    }

    return projectPreview(result, fields);
}
