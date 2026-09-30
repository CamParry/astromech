import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { restoreVersion } from '@/content/versions';
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
 * this type, or no version with that number, throws.
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

        return restoreVersion({
            resource: 'entry',
            versions: entryRepository.versions,
            current,
            version,
            address: { id },
            user,
            write: async ({ fields, columns }) => {
                const slug = await uniqueSlugIfChanged({
                    type,
                    entry: current,
                    slug: columns['slug'] as string | null,
                });
                const restored = await entryRepository.update(
                    { id, locale: current.locale },
                    {
                        title: columns['title'] as string,
                        slug: slug ?? current.slug,
                        fields,
                        updatedBy: userId,
                    }
                );
                await syncEntryRelationships(config, restored, type);
                return restored;
            },
        });
    },
});
