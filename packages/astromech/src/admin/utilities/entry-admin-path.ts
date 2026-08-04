/**
 * Admin edit path for an entry, from its wire type id.
 *
 * A plugin entry type lives at `/plugin/<ns>/entries/<bare-type>/<id>`; the root
 * `/entries/<qualified>/<id>` route renders but emits 404 links, so a qualified
 * id must never be pasted into it.
 */

import { parseEntryTypeId } from '@/entries/type-ids.js';

export function entryAdminPath(typeId: string, id: string): string {
    const parsed = parseEntryTypeId(typeId);
    if (parsed === null) return `/entries/${typeId}/${id}`;
    return `/plugin/${parsed.plugin}/entries/${parsed.type}/${id}`;
}
