import type { Global, JsonObject } from '@/types/index';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { asGlobal, requireCanonical } from '../../internal/global';

/**
 * Restores one locale of a global to one of its saved versions, snapshotting the
 * state being overwritten first so a restore is itself reversible. Throws when
 * the version does not exist or belongs to another locale.
 */
export async function restoreGlobalVersion(params: {
    key: string;
    locale?: string;
    versionId: string;
}): Promise<Global> {
    const { repository, id, locale, current } = await requireCanonical({
        key: params.key,
        locale: params.locale,
        capability: 'versioning',
    });

    const version = await repository.versions.get(params.versionId);
    if (!version || version.contentId !== current.contentId) {
        throw new Error('Version not found');
    }
    const restoredFields = ((version.fields as JsonObject | null) ??
        current.fields) as JsonObject;

    const updated = await transaction(async () => {
        await snapshotVersion(repository.versions, current);
        return repository.update({ id, locale }, { fields: restoredFields });
    });

    return asGlobal(updated);
}
