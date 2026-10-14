/**
 * `writeGuarded` when a write changed nothing and the repository can no longer
 * say why: the error names the condition the guard sets. The services' own
 * races are pinned beside each method; these cover the conditions no current
 * caller sets alone.
 */

import type { ContentRowId } from '@/content/repository/types';
import type { WriteGuard } from '@/content/write-guard';
import { describe, expect, it } from 'vitest';
import { writeGuarded } from '@/content/write-guard';
import { ResourceConflictError, ResourceNotFoundError } from '@/errors/resource';

const contentId = 'row' as ContentRowId;

/** A write that matched no row, from a repository that finds every condition holding. */
function refused(guard: WriteGuard): Promise<unknown> {
    return writeGuarded({
        type: 'entry',
        address: { id: 'e1', locale: 'en' },
        guard,
        repository: { explainConflict: async () => null },
        write: async () => null,
    });
}

describe('writeGuarded, when the refusal cannot be explained', () => {
    it('names `published` as not-published', async () => {
        const write = refused({ contentId, published: true, draft: null });

        await expect(write).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(write).rejects.toMatchObject({
            details: { reason: 'not-published' },
        });
    });

    it('names `draft` as draft-changed', async () => {
        await expect(refused({ contentId, draft: new Date() })).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
    });

    it('answers 404 for a guard that names only the row', async () => {
        await expect(refused({ contentId })).rejects.toBeInstanceOf(
            ResourceNotFoundError
        );
    });
});
