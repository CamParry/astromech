import type { ListParams } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import type {
    Entry,
    Field,
    QueryResult,
    ReferencesFilter,
    ResolvedConfig,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { queryPage, sortSchema } from '@/content/list';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { collectRelationshipSchemaPaths } from '@/fields/references';
import { defineServiceMethod } from '@/services/define-service-method';
import { InvalidReferencesFilterError, PublicTrashedReadError } from '../errors';
import { entryGate } from '../internal/access';
import { queryPreviewEntries } from '../internal/preview-read';
import { toEntry } from '../internal/read-entry';
import { entryRepository } from '../repository/entries-table';

/**
 * Lists entries of one or more types, paginated and filtered to the caller's
 * visibility shape. A `previewToken` takes the preview path; a public read of
 * trashed rows throws, since the public shape can never return them.
 */
export const queryEntries = defineServiceMethod({
    summary: 'List entries of one type.',
    input: z.object({
        // One type or several: a cross-type listing names them all, and the
        // permission is checked per type the call touches.
        type: z.union([z.string(), z.array(z.string())]),
        search: z.string().optional(),
        where: z.record(z.string(), z.unknown()).optional(),
        trashed: z.boolean().optional(),
        page: z.number().optional(),
        limit: z.union([z.number(), z.literal('all')]).optional(),
        sort: sortSchema,
        locale: z.string().optional(),
        full: z.boolean().optional(),
        previewToken: z.string().optional(),
        staged: z.boolean().optional(),
    }),
    access: entryGate('read'),
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<Entry>> {
        // Preview (forward versioning): token-authorized read that bypasses the
        // publish gate. Public shape only; diverges enough to take its own path.
        if (params.previewToken) return queryPreviewEntries(ctx.config, params);

        const config = ctx.config;
        const typeParam = params.type;
        const types = Array.isArray(typeParam) ? Array.from(typeParam) : [typeParam];

        // Absent `full` ⇒ public.
        const shape: VisibilityShape = params.full ? 'full' : 'public';

        // A public read can never return a trashed row: the public shape forces
        // `status: 'published'` below and `applyVisibility` drops every trashed row
        // afterwards. Asking for both would yield an empty list indistinguishable
        // from "nothing is trashed", so reject it instead.
        if (params.trashed === true && shape === 'public') {
            throw new PublicTrashedReadError();
        }

        // A single type resolves one config; a cross-type query resolves per row.
        const singleType = types.length === 1 ? (types[0] ?? null) : null;

        const singleTypeCfg = singleType
            ? resolveEntryType(config, singleType)
            : undefined;

        // The public row filter's status and publish time go into the SQL, so the
        // count matches the rows; `applyVisibility` still projects the fields and
        // repeats the check. A type without statuses has neither column.
        const hasStatuses = singleTypeCfg
            ? singleTypeCfg.capabilities.statuses !== false
            : true;
        const filtersPublished = shape === 'public' && hasStatuses;
        const effectiveWhere = filtersPublished
            ? { ...params.where, status: 'published' }
            : params.where;
        const now = new Date();

        const references = params.where?.['references'];
        if (references !== undefined) {
            assertReferencesFilter(references, types, config);
        }

        const filters: ListParams = {
            type: singleType ?? types,
            locale: params.locale,
            trashed: params.trashed ?? false,
            search: params.search,
            where: effectiveWhere,
            ...(filtersPublished ? { publishedAsOf: now } : {}),
        };
        const { data: rows, pagination } = await queryPage(params, {
            list: (page) =>
                entryRepository.findMany({ ...filters, sort: params.sort, ...page }),
            count: () => entryRepository.count(filters),
        });

        const data = rows.map(toEntry);

        const audience = { now };

        // Field definitions per type, flattened once: a cross-type page mixes
        // types, and a single-type page would otherwise flatten per row.
        const fieldsByType = new Map<string, Field[]>();
        const fieldsOf = (type: string): Field[] => {
            let fields = fieldsByType.get(type);
            if (fields === undefined) {
                const entryType = resolveEntryType(config, type);
                fields = entryType ? flattenEntryFields(entryType.fields) : [];
                fieldsByType.set(type, fields);
            }
            return fields;
        };

        const visibleData: Entry[] = [];
        for (const entry of data) {
            const rowFields = fieldsOf(entry.type);

            const filtered = applyVisibility(entry, {
                shape,
                fields: rowFields,
                audience,
            });

            if (filtered !== null) {
                visibleData.push(filtered);
            }
        }

        return { data: visibleData, pagination };
    },
});

/**
 * Check `where: { references }` against the queried types' schemas before it
 * reaches the repository. One type declaring the path is enough — a cross-type query
 * is legal and requiring every type to declare it would reject valid reads.
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
