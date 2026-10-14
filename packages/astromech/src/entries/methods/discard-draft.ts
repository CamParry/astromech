import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { assertGuardHolds } from '@/content/write-guard';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { getEntryOfType } from '../read-entry';
import { entryDraftRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';

/**
 * Deletes the locale's draft and answers the entry as it is live, which the
 * draft never changed: no hook fires, no version is written and the index
 * stays, since it holds live content only. Strapi 5 names it the same. Throws
 * when the locale has no row of this type or no draft; a trashed entry
 * answers 409.
 */
export const discardEntryDraft = defineServiceMethod({
    summary: 'Discard the unpublished changes to a published entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: entrySchema,
    access: entryAccess('update'),
    requires: 'statuses',
    mutates: true,
    destructive: true,
    async handler(params): Promise<EntryResource> {
        const { type, id } = params;

        const entry = await getEntryOfType(type, id, params.locale);
        const { locale } = entry;
        assertGuardHolds(
            'entry',
            { canonical: entry },
            { contentId: entry.contentId, trash: 'live' },
            { id, locale }
        );
        if (!(await entryDraftRepository.delete(id, locale))) {
            throw new ResourceNotFoundError('entry', { id, locale, draft: true });
        }
        return { ...entry, hasDraft: false };
    },
});
