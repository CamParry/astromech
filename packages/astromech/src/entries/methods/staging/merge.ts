import type { EntryResource } from '../../repository/types';
import type { WriteGuard } from '@/content/write-guard';
import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { snapshotVersion } from '@/content/versions';
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { prepareEntryFields } from '../../internal/prepare-fields';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Checks the staged fields at the canonical row's status, versions the canonical
 * when the type keeps versions, overwrites its title and fields, and discards the
 * staged change. A staged slug that differs from the canonical's replaces it, or
 * the next free one if a live entry took it meanwhile. The status stays:
 * publishing is a separate call. An entry in the trash answers 409.
 */
export const mergeStagedEntry = defineServiceMethod({
    summary: 'Merge the staged change into an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: entrySchema,
    access: entryAccess('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const versioning =
            resolveEntryType(config, type)?.capabilities.versioning === true;

        const canonical = await getEntryOfType(type, id, params.locale);
        const { locale } = canonical;
        const guard: WriteGuard = { contentId: canonical.contentId, trash: 'live' };
        assertGuardHolds('entry', { canonical }, guard, { id, locale });
        const staged = await requireStagedChange(entryRepository.staging, 'entry', {
            rowId: id,
            id,
            locale,
        });

        const fields = await prepareEntryFields({
            kind: 'merge',
            config,
            type,
            canonical,
            staged,
            user,
        });
        const slug = await uniqueSlugIfChanged({
            type,
            entry: canonical,
            slug: staged.slug,
        });

        return transaction(async () => {
            if (versioning) {
                await snapshotVersion('entry', entryRepository, guard, user, {
                    id,
                    locale,
                });
            }
            const updated = await writeGuarded({
                kind: 'entry',
                address: { id, locale },
                guard,
                repository: entryRepository,
                write: () =>
                    entryRepository.update(
                        { id, locale },
                        { title: staged.title, slug, fields, updatedBy: userId },
                        guard
                    ),
            });
            // Deleted before the re-index, so references only the staged change
            // held are dropped.
            await entryRepository.staging.delete({ id, locale });
            await syncEntryRelationships(config, updated, type);
            return updated;
        });
    },
});
