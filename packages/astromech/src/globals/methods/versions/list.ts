import type { GlobalVersion, JsonObject } from '@/types/index';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { requireCanonical } from '../../internal/global';
import { localised } from '../../schema';

/**
 * Lists the saved versions of one locale of a global, newest first. Throws when
 * the global does not keep versions, or has no row in that locale.
 */
export const listGlobalVersions = defineServiceMethod({
    summary: 'List the version history of a global.',
    input: localised,
    access: gate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(
        params: { key: string; locale?: string },
        ctx
    ): Promise<GlobalVersion[]> {
        const { repository, current } = await requireCanonical(ctx.config, {
            ...params,
            capability: 'versioning',
        });

        const rows = await repository.versions.list(current.contentId);
        return rows.map((row) => ({
            id: row.id,
            // A version row names the content row it snapshots, so the global
            // and locale come from the record it was read for.
            key: params.key,
            locale: current.locale,
            version: row.version,
            fields: (row.fields ?? null) as JsonObject | null,
            status: row.status,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
        }));
    },
});
