import type { GlobalResource } from '../repository';
import type { ParsedGlobalUpdateData } from '../service-types';
import type { GlobalDraftRow } from '@/globals/tables';
import { foldDraftFields, readDraft, withDraft } from '@/content/drafts';
import { globalDraftRepository } from '../repository';

/** The global as its draft reads: the draft's fields over the live row. */
export function withGlobalDraft(
    global: GlobalResource,
    draft: GlobalDraftRow
): GlobalResource {
    return withDraft(global, draft);
}

/** The global with its locale's draft over it, or as it is live when it has none. */
export function readGlobalDraft(global: GlobalResource): Promise<GlobalResource> {
    return readDraft(global, globalDraftRepository, withGlobalDraft);
}

/**
 * The patch a publish action writes to a locale with a draft: the draft's
 * fields, with the caller's patch over them (`foldDraftFields`).
 */
export function foldGlobalDraft(
    draft: GlobalDraftRow,
    data: ParsedGlobalUpdateData
): ParsedGlobalUpdateData {
    return { ...data, fields: foldDraftFields(draft.fields, data.fields) };
}
