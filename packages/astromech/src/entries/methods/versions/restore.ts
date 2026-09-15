import type { Entry, JsonObject } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { CapabilityError, EntryNotFoundError } from '../../errors';
import { entryGate } from '../../internal/access';
import { asEntry, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { snapshotVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Restores one locale of an entry to one of its saved versions: overwrites the
 * content row with the version's title, slug, and fields. Throws if the version
 * does not exist or belongs to another locale.
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
        const { type, id, versionId } = params;

        const repository = getEntryRepository(type);
        if (!repository.versions) throw new CapabilityError(type, 'versioning');
        // The guard's narrowing does not survive into the transaction closure below.
        const versions = repository.versions;

        const currentEntry = await getEntryOfType(
            ctx.config,
            repository,
            type,
            id,
            params.locale
        );

        const version = await versions.get(versionId);
        if (!version || version.contentId !== currentEntry.contentId) {
            throw new EntryNotFoundError({ entryId: id, locale: currentEntry.locale });
        }

        const slug = await uniqueSlugIfChanged({
            repository,
            type,
            entry: currentEntry,
            slug: version.slug,
        });
        const restoredFields = (version.fields as JsonObject) ?? currentEntry.fields;

        // Snapshot the state being overwritten, update the row, and reindex it
        // atomically, so a restore is itself reversible and never leaves the row
        // and its relationship index out of step.
        const updated = await transaction(async () => {
            await snapshotVersion(versions, currentEntry, ctx.user);
            const row = await repository.update(
                { id, locale: currentEntry.locale },
                {
                    title: version.title,
                    slug: slug ?? currentEntry.slug,
                    fields: restoredFields,
                }
            );
            await indexEntryRelationships(ctx.config, row, restoredFields, type);
            return row;
        });

        return asEntry(updated);
    },
});
