import type { VisibilityShape } from '../visibility';
import type { Entry } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { getCurrentUser } from '@/request-context/index';
import { getEntryStorage } from '../storage/registry';
import { applyVisibility, markPublic } from '../visibility';
import { runPreviewGet } from './preview/read';

export async function get(params: {
    type: string;
    id: string;
    locale?: string;
    full?: boolean;
    previewToken?: string;
    staged?: boolean;
}): Promise<Entry | null> {
    const { type, id } = params;

    // Preview (forward versioning): token-authorized, publish-gate-bypassed.
    if (params.previewToken) return runPreviewGet(type, id, params);

    const storage = getEntryStorage(type);
    const record = await storage.get(id);

    if (!record) return null;
    if (record.type !== undefined && record.type !== type) return null;

    const result = record as Entry;
    // tableStorage-backed records carry no `type` column — stamp it so the
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
