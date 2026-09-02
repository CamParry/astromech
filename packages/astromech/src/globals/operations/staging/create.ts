import type { Global, GlobalUpdateData, JsonObject } from '@/types/index';
import { mergePatch } from '@/fields/values';
import { getCurrentUser } from '@/request-context/request-context';
import { StagedGlobalExistsError } from '../../errors';
import { asGlobal, requireCanonical } from '../../internal/global';

/**
 * Creates a staged copy of one locale of a global so edits can be drafted off
 * the live row, with `data.fields` patched over the copy. A global with no row
 * in this locale cannot be staged — there is nothing to stage off — and a locale
 * that already has a staged change throws rather than silently replacing it.
 */
export async function createStagedGlobal(params: {
    key: string;
    locale?: string;
    data?: GlobalUpdateData;
}): Promise<Global> {
    const { repository, id, locale, current } = await requireCanonical({
        key: params.key,
        locale: params.locale,
        capability: 'staging',
    });

    const existing = await repository.staging.getByCanonical(id, locale);
    if (existing) throw new StagedGlobalExistsError({ key: params.key, locale });

    const user = await getCurrentUser();
    // The staged row copies the canonical's content and is always unpublished:
    // it becomes live by being merged, not by carrying a status of its own.
    const row = await repository.staging.create(
        { id, locale },
        {
            fields: (params.data
                ? mergePatch(current.fields, params.data.fields)
                : current.fields) as JsonObject,
            status: 'unpublished',
            publishedAt: null,
            createdBy: user?.id ?? null,
            updatedBy: user?.id ?? null,
        }
    );
    return asGlobal(row);
}
