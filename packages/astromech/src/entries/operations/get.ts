import type { VisibilityShape } from '../visibility';
import type { Entry } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { getCurrentUser } from '@/request-context/request-context';
import { getDefaultContentLocale } from '../internal/entry-type';
import { asEntry } from '../internal/records';
import { getEntryRepository } from '../repository/registry';
import { applyVisibility, markPublic } from '../visibility';
import { getPreviewEntry } from './preview/read';

/**
 * Gets one locale of one entry, filtered to the caller's visibility shape.
 * Returns null when that locale has no row, its type differs, or visibility
 * hides it — there is no fallback to another locale. A `previewToken` takes the
 * token-authorized preview path that skips the publish gate.
 */
export async function getEntry(params: {
    type: string;
    id: string;
    locale?: string;
    full?: boolean;
    previewToken?: string;
    staged?: boolean;
}): Promise<Entry | null> {
    const { type, id } = params;

    // Preview (forward versioning): token-authorized, publish-gate-bypassed.
    if (params.previewToken) return getPreviewEntry(params);

    const repository = getEntryRepository(type);
    const record = await repository.get({
        id,
        locale: params.locale ?? getDefaultContentLocale(),
    });

    if (!record) return null;
    if (record.type !== undefined && record.type !== type) return null;

    const result = asEntry(record);
    // tableRepository-backed records carry no `type` column — stamp it so the
    // returned entry is complete.
    if (result.type === undefined) result.type = type;

    const shape: VisibilityShape = params.full ? 'full' : 'public';
    const user = await getCurrentUser();
    const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };
    const entryType = resolveEntryType(getConfig(), type);
    const fields = entryType ? flattenEntryFields(entryType.fields) : [];

    const filtered = applyVisibility(result, { shape, fields, audience });

    if (filtered === null) return null;

    return shape === 'public' ? markPublic(filtered) : filtered;
}
