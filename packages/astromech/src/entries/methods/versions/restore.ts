import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { CapabilityError } from '@/errors/capability';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { asEntry, getEntryOfType } from '../../internal/records';
import { syncEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { getEntryRepository } from '../../repository/registry';

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
    access: entryGate('update'),
    requires: 'versioning',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<Entry> {
        const { type, id } = params;

        const repository = getEntryRepository(type);
        if (!repository.versions) throw new CapabilityError('entry', type, 'versioning');

        const currentEntry = await getEntryOfType(
            ctx.config,
            repository,
            type,
            id,
            params.locale
        );

        return restoreVersion({
            spec: RESOURCE_SPECS.entry,
            versions: repository.versions,
            current: currentEntry,
            versionId: params.versionId,
            address: { id, locale: currentEntry.locale },
            user: ctx.user,
            write: async ({ fields, columns }) => {
                const slug = await uniqueSlugIfChanged({
                    repository,
                    type,
                    entry: currentEntry,
                    slug: columns['slug'] as string | null,
                });
                const row = await repository.update(
                    { id, locale: currentEntry.locale },
                    {
                        title: columns['title'] as string,
                        slug: slug ?? currentEntry.slug,
                        fields,
                    }
                );
                await syncEntryRelationships(ctx.config, row, fields, type);
                return asEntry(row);
            },
        });
    },
});
