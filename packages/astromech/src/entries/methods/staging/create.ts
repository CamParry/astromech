import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Copies one locale's title, slug and fields into an unpublished staged change,
 * which `update({ staged: true })` edits and `mergeStaged` makes live. Throws
 * when the locale has no row of this type, or already has a staged change.
 */
export const createStagedEntry = defineServiceMethod({
    summary: 'Stage a change to an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: entrySchema,
    access: entryAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const canonical = await getEntryOfType(type, id, params.locale);
        const { locale } = canonical;
        const existing = await entryRepository.staging.findOne({ id, locale });
        if (existing) throw new StagedChangeExistsError('entry', { id, locale });

        return transaction(async () => {
            // The partial unique index lets the staged row keep the canonical's slug.
            const created = await entryRepository.staging.create(
                { id, locale },
                {
                    title: canonical.title,
                    slug: canonical.slug,
                    fields: canonical.fields,
                    status: 'unpublished',
                    publishedAt: null,
                    createdBy: userId,
                    updatedBy: userId,
                }
            );
            await syncEntryRelationships(config, created, type);
            return created;
        });
    },
});
