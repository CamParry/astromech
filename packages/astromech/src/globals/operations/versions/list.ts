import type { GlobalVersion, JsonObject } from '@/types/index';
import { requireCanonical } from '../../internal/global';

/**
 * Lists the saved versions of one locale of a global, newest first. Throws when
 * the global does not keep versions, or has no row in that locale.
 */
export async function listGlobalVersions(params: {
    key: string;
    locale?: string;
}): Promise<GlobalVersion[]> {
    const { repository, current } = await requireCanonical({
        ...params,
        capability: 'versioning',
    });

    const rows = await repository.versions.list(current.contentId);
    return rows.map((row) => ({
        id: row.id,
        // A version row names the content row it snapshots, so the global and
        // locale come from the record it was read for.
        key: params.key,
        locale: current.locale,
        version: row.version,
        fields: (row.fields ?? null) as JsonObject | null,
        status: row.status,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
    }));
}
