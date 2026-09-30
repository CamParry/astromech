import type { EntryResource, ListParams } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import type { Field, QueryResult, ReferencesFilter, ResolvedConfig } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { listKeys, queryPage, queryResultSchema } from '@/content/list';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { collectRelationshipSchemaPaths } from '@/fields/references';
import { defineServiceMethod } from '@/services/define-service-method';
import { InvalidReferencesFilterError, PublicTrashedReadError } from '../errors';
import { entryAccess } from '../internal/access';
import { queryPreviewEntries } from '../internal/preview';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';

/**
 * `type` names one type or several. Paginated unless `limit` is `'all'`, and
 * filtered to the caller's visibility shape; a `previewToken` reads past the
 * publish gate. Asking for `trashed` rows in the public shape throws.
 */
export const queryEntries = defineServiceMethod({
    summary: 'List entries.',
    input: z.strictObject({
        // One type or several: a cross-type listing names them all, and the
        // permission is checked per type the call touches.
        type: z.union([z.string(), z.array(z.string())]),
        search: z.string().optional(),
        where: z.record(z.string(), z.unknown()).optional(),
        trashed: z.boolean().optional(),
        ...listKeys,
        locale: z.string().optional(),
        full: z.boolean().optional(),
        previewToken: z.string().optional(),
        staged: z.boolean().optional(),
    }),
    output: queryResultSchema(entrySchema),
    access: entryAccess('read'),
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<EntryResource>> {
        const { type, where, trashed, search, sort, full } = params;
        const { config } = ctx;
        const types = Array.isArray(type) ? Array.from(type) : [type];
        const singleType = types.length === 1 ? (types[0] ?? null) : null;
        const entryType = singleType ? resolveEntryType(config, singleType) : undefined;
        const shape: VisibilityShape = full ? 'full' : 'public';
        const now = new Date();

        if (params.previewToken) return queryPreviewEntries(config, params);
        if (trashed === true && shape === 'public') throw new PublicTrashedReadError();
        const references = where?.['references'];
        if (references !== undefined) assertReferencesFilter(references, types, config);

        // The public row filter's status and publish time go into the SQL, so the
        // count matches the rows; `applyVisibility` still projects the fields and
        // repeats the check. A type without statuses has neither column.
        const hasStatuses = entryType ? entryType.capabilities.statuses !== false : true;
        const filtersPublished = shape === 'public' && hasStatuses;
        const filters: ListParams = {
            type: singleType ?? types,
            locale: params.locale,
            trashed: trashed ?? false,
            search,
            where: filtersPublished ? { ...where, status: 'published' } : where,
            ...(filtersPublished ? { publishedAsOf: now } : {}),
        };

        const { data, pagination } = await queryPage(params, {
            list: (page) => entryRepository.findMany({ ...filters, sort, ...page }),
            count: () => entryRepository.count(filters),
        });

        const fieldsOf = fieldsByType(config);
        const visible = data.flatMap(
            (entry) =>
                applyVisibility(entry, {
                    shape,
                    fields: fieldsOf(entry.type),
                    audience: { now },
                }) ?? []
        );

        return { data: visible, pagination };
    },
});

/**
 * Checks `where: { references }` against the queried types' schemas before it
 * reaches the repository. One type declaring the path is enough: a cross-type
 * query is legal, and requiring every type to declare it would reject valid reads.
 */
function assertReferencesFilter(
    value: unknown,
    types: string[],
    config: ResolvedConfig
): void {
    const filter = value as Partial<ReferencesFilter> | null;
    const path = typeof filter?.path === 'string' ? filter.path : '';
    const id = typeof filter?.id === 'string' ? filter.id : '';

    const knownPaths = Array.from(
        new Set(
            types.flatMap((type) => {
                const typeConfig = resolveEntryType(config, type);
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

/**
 * Each type's flattened fields, resolved once per type however many rows of it a
 * page holds.
 */
function fieldsByType(config: ResolvedConfig): (type: string) => Field[] {
    const cache = new Map<string, Field[]>();
    return (type) => {
        let fields = cache.get(type);
        if (fields === undefined) {
            const entryType = resolveEntryType(config, type);
            fields = entryType ? flattenEntryFields(entryType.fields) : [];
            cache.set(type, fields);
        }
        return fields;
    };
}
