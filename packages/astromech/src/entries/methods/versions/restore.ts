import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Restores one locale of an entry to one of its saved versions, by its number:
 * overwrites the content row with the version's title, slug and fields, and
 * re-indexes it. Throws if that locale has no version with the number.
 */
export const restoreEntryVersion = defineServiceMethod({
    summary: 'Roll an entry back to an earlier version.',
    input: restoreEntryVersionInput({ type: z.string() }),
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
            version: params.version,
            address: { id },
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

/**
 * `entries.restoreVersion`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function restoreEntryVersionInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({
        type,
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    });
}
