import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { syncEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Restores one locale of an entry to one of its saved versions: overwrites the
 * content row with the version's title, slug and fields, and re-indexes it.
 * Throws if the version does not exist or belongs to another locale.
 */
export const restoreEntryVersion = defineServiceMethod({
    summary: 'Roll an entry back to an earlier version.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
        versionId: z.string(),
    }),
    output: entrySchema,
    access: entryGate('update'),
    requires: 'versioning',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id } = params;

        const currentEntry = await getEntryOfType(type, id, params.locale);

        return restoreVersion({
            spec: RESOURCE_SPECS.entry,
            versions: entryRepository.versions,
            current: currentEntry,
            versionId: params.versionId,
            address: { id, locale: currentEntry.locale },
            user: ctx.user,
            write: async ({ fields, columns }) => {
                const slug = await uniqueSlugIfChanged({
                    type,
                    entry: currentEntry,
                    slug: columns['slug'] as string | null,
                });
                const row = await entryRepository.update(
                    { id, locale: currentEntry.locale },
                    {
                        title: columns['title'] as string,
                        slug: slug ?? currentEntry.slug,
                        fields,
                        updatedBy: ctx.user?.id ?? null,
                    }
                );
                await syncEntryRelationships(ctx.config, row, type);
                return row;
            },
        });
    },
});
