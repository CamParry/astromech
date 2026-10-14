import type { EntryResource } from '../repository/types';
import type { ParsedEntryUpdateData } from '../service-types';
import type { EntryDraftRow } from '@/entries/tables';
import type { JsonObject } from '@/types/index';
import { entryDraftRepository } from '../repository/entries-table';

/**
 * The entry as its draft reads: the draft's title, slug and fields over the
 * live row, and the draft's own `updatedAt` and `updatedBy`, since a draft
 * save never stamps the entry row (`decisions/one-updated-at-per-resource.md`).
 */
export function withDraft(entry: EntryResource, draft: EntryDraftRow): EntryResource {
    return {
        ...entry,
        title: draft.title,
        slug: draft.slug,
        fields: (draft.fields ?? {}) as JsonObject,
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy,
        hasDraft: true,
    };
}

/** The entry with its locale's draft over it, or as it is live when it has none. */
export async function readDraft(entry: EntryResource): Promise<EntryResource> {
    if (!entry.hasDraft) return entry;
    const draft = await entryDraftRepository.findOne(entry.id, entry.locale);
    return draft ? withDraft(entry, draft) : entry;
}

/**
 * The patch a publish action writes to a locale with a draft: the draft's
 * content, with the caller's patch over it. Fields merge as an update's do, so
 * a key the caller names replaces the draft's and every other key stays.
 */
export function foldDraft(
    draft: EntryDraftRow,
    data: ParsedEntryUpdateData
): ParsedEntryUpdateData {
    const fields = (draft.fields ?? {}) as JsonObject;
    return {
        ...data,
        title: data.title ?? draft.title,
        // The update schema takes no null slug; a null draft slug keeps the row's.
        ...(data.slug === undefined && draft.slug !== null ? { slug: draft.slug } : {}),
        fields: data.fields === undefined ? fields : { ...fields, ...data.fields },
    };
}
