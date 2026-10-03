import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { restoreVersion } from '@/content/versions';
import { assertGuardHolds } from '@/content/write-guard';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Saves the content it overwrites as a new version first, so a restore can be
 * undone; the restored slug is made unique in its locale. A locale with no row of
 * this type, or no version with that number, throws; a trashed entry answers 409.
 */
export const restoreEntryVersion = defineServiceMethod({
    summary: 'Roll an entry back to an earlier version.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: entrySchema,
    access: entryAccess('update'),
    requires: 'versioning',
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id, version } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const current = await getEntryOfType(type, id, params.locale);
        const guard = { contentId: current.contentId, trash: 'live' } as const;
        assertGuardHolds('entry', { canonical: current }, guard, {
            id,
            locale: current.locale,
        });

        return restoreVersion({
            resource: 'entry',
            repository: entryRepository,
            current,
            version,
            address: { id },
            user,
            guard,
            write: async ({ fields, columns }) => {
                const ref = { id, locale: current.locale };
                const slug = await uniqueSlugIfChanged({
                    type,
                    entry: current,
                    slug: columns['slug'] as string | null,
                });
                const restored = await entryRepository.update(
                    ref,
                    {
                        title: columns['title'] as string,
                        slug: slug ?? current.slug,
                        fields,
                        updatedBy: userId,
                    },
                    guard
                );
                if (restored === null) return null;
                await entryRepository.updateStagedSlug(ref, {
                    from: current.slug,
                    to: restored.slug,
                });
                await syncEntryRelationships(config, restored, type);
                return restored;
            },
        });
    },
});
