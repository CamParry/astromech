import config from 'virtual:astromech/config';
import { flattenEntryFields } from '@/fields/helpers.js';
import { getCurrentUser } from '@/context/index.js';
import { resolveEntryType } from '../type-registry.js';
import { getEntryStorage } from '../storage/registry.js';
import { runPreviewGet } from './preview/read.js';
import { applyVisibility, markPublic, type VisibilityShape } from '../visibility.js';
import type { Entry } from '@/types/index.js';

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
    const user = getCurrentUser();
    const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };
    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    const filtered = applyVisibility(result, { shape, fields, audience });

    if (filtered === null) return null;

    return shape === 'public' ? markPublic(filtered) : filtered;
}
