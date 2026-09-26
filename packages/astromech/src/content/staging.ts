/** The staged-change lookup and divergence check entries and globals share. */

import type { Resource } from './repository/types';
import { ResourceNotFoundError } from '@/errors/resource';

/**
 * The staged change of one locale, which the call requires: a merge, a discard
 * or a staged write. Answers 404 when there is none.
 *
 * @param address `rowId` is the resource row the staged change hangs off; `id`
 *   is what the 404 names, a global's key or an entry's id.
 */
export async function requireStagedChange<R>(
    staging: { findOne(ref: { id: string; locale: string }): Promise<R | null> },
    kind: 'entry' | 'global',
    address: { rowId: string; id: string; locale: string }
): Promise<R> {
    const staged = await staging.findOne({ id: address.rowId, locale: address.locale });
    if (!staged) {
        throw new ResourceNotFoundError(kind, {
            id: address.id,
            locale: address.locale,
            staged: true,
        });
    }
    return staged;
}

/**
 * True when the canonical content row was written after the staged change was
 * made from it, so a merge would overwrite that later write.
 */
export function hasDiverged(
    canonical: Pick<Resource, 'contentUpdatedAt'>,
    staged: Pick<Resource, 'contentCreatedAt'>
): boolean {
    return canonical.contentUpdatedAt.getTime() > staged.contentCreatedAt.getTime();
}
