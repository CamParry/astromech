/** The staged-change lookup entries and globals share. */

import { ResourceNotFoundError } from '@/errors/resource';

/**
 * The staged change of one locale, which the call requires: a merge, a discard
 * or a staged write. Answers 404 when there is none.
 *
 * @param address `rowId` is the resource row the staged change hangs off; `id`
 *   is what the 404 names, a global's key or an entry's id.
 */
export async function requireStagedChange<R>(
    staging: { getByCanonical(id: string, locale?: string): Promise<R | null> },
    kind: 'entry' | 'global',
    address: { rowId: string; id: string; locale: string }
): Promise<R> {
    const staged = await staging.getByCanonical(address.rowId, address.locale);
    if (!staged) {
        throw new ResourceNotFoundError(kind, {
            id: address.id,
            locale: address.locale,
            staged: true,
        });
    }
    return staged;
}
