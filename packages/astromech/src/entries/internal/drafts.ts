import type { EntryResource } from '../repository/types';
import type { ParsedEntryUpdateData } from '../service-types';
import type { EntryDraftRow } from '@/entries/tables';
import { foldDraftFields, readDraft, withDraft } from '@/content/drafts';
import { entryDraftRepository } from '../repository/entries-table';

/** The entry as its draft reads: the draft's title, slug and fields over the live row. */
export function withEntryDraft(
    entry: EntryResource,
    draft: EntryDraftRow
): EntryResource {
    return withDraft(entry, draft, { title: draft.title, slug: draft.slug });
}

/** The entry with its locale's draft over it, or as it is live when it has none. */
export function readEntryDraft(entry: EntryResource): Promise<EntryResource> {
    return readDraft(entry, entryDraftRepository, withEntryDraft);
}

/**
 * The patch a publish action writes to a locale with a draft: the draft's
 * content, with the caller's patch over it (`foldDraftFields`).
 */
export function foldEntryDraft(
    draft: EntryDraftRow,
    data: ParsedEntryUpdateData
): ParsedEntryUpdateData {
    return {
        ...data,
        title: data.title ?? draft.title,
        // The update schema takes no null slug; a null draft slug keeps the row's.
        ...(data.slug === undefined && draft.slug !== null ? { slug: draft.slug } : {}),
        fields: foldDraftFields(draft.fields, data.fields),
    };
}
