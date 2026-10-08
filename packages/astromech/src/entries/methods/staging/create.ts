import type { EntryResource } from '../../repository/types';
import type { WriteGuard } from '@/content/write-guard';
import { z } from '@hono/zod-openapi';
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Copies one locale's title, slug and fields, as stored when the copy is made,
 * into an unpublished staged change, which `update({ staged: true })` edits and
 * `mergeStaged` makes live. Throws when the locale has no row of this type, the
 * entry is in the trash, or the locale already has a staged change.
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
        const staged = await entryRepository.staging.findOne({ id, locale });
        const guard: WriteGuard = {
            contentId: canonical.contentId,
            trash: 'live',
            stagedAbsent: true,
        };
        assertGuardHolds('entry', { canonical, staged }, guard, { id, locale });

        return transaction(async () => {
            // The partial unique index lets the staged row keep the canonical's slug.
            const created = await writeGuarded({
                kind: 'entry',
                address: { id, locale },
                guard,
                repository: entryRepository,
                write: () =>
                    entryRepository.staging.create(
                        { id, locale },
                        {
                            status: 'unpublished',
                            publishedAt: null,
                            createdBy: userId,
                            updatedBy: userId,
                        },
                        guard
                    ),
            });
            await syncEntryRelationships(config, created);
            return created;
        });
    },
});
