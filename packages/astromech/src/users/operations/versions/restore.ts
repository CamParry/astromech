import type { JsonObject, User } from '@/types/index';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { UserNotFoundError } from '../../errors';
import { resolveUserLocale, userRepository } from '../../internal/locale';
import { indexUserRelationships } from '../../internal/relationships';
import { toUser } from '../../internal/to-user';

/**
 * Restores one locale of a user's fields to one of its saved versions,
 * snapshotting the state being overwritten first so a restore is itself
 * reversible. A version belonging to another locale is not found, not a
 * different row to write.
 */
export async function restoreUserVersion(params: {
    id: string;
    locale?: string;
    versionId: string;
}): Promise<User> {
    const { id } = params;
    const locale = resolveUserLocale(params.locale);
    const repository = userRepository();
    const current = await repository.getExact(id, locale);
    if (!current) throw new UserNotFoundError({ id, locale });

    const version = await repository.versions.get(params.versionId);
    if (!version || version.contentId !== current.contentId) {
        throw new UserNotFoundError({ id, locale });
    }
    const fields = ((version.fields as JsonObject | null) ??
        current.fields) as JsonObject;

    const updated = await transaction(async () => {
        await snapshotVersion(repository.versions, current, {});
        const row = await repository.update({ id, locale }, { fields });
        await indexUserRelationships(id, fields);
        return row;
    });

    return toUser(updated);
}
