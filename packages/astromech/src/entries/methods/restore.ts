import type { EntryResource } from '../repository/types';
import type { AppContext, ParsedEntryUpdateData } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { UnknownEntryTypeError } from '../errors';
import { entryAccess } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { writeBatch } from '../internal/write-batch';
import { getEntryResources } from '../read-entry';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';

/**
 * Takes one `id` or a list of `ids`, restored atomically with every locale, and
 * answers each one's default-locale row. While still in the trash, each locale
 * is set `unpublished` through the update path, firing the update hooks, and
 * takes the next free slug if its own was taken meanwhile.
 */
export const restoreEntries = defineServiceMethod({
    summary: 'Restore a trashed entry.',
    input: oneOrMany(z.strictObject({ type: z.string(), ...batchAddress })),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryAccess('update'),
    requires: 'trash',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return restoreOne(params, ctx);
    },
});

const restoreOne = fromBatch(restoreEntryBatch);

async function restoreEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<EntryResource[]> {
    const { type, ids } = params;
    const { config, user } = ctx;
    const userId = user?.id ?? null;
    const entryType = resolveEntryType(config, type);
    if (!entryType) throw new UnknownEntryTypeError(type);
    const { statuses, slug: hasSlug } = entryType.capabilities;

    const entries = await getEntryResources(type, ids);

    // Slugs given to an earlier entry of this batch, per locale, which the
    // database cannot see until the batch leaves the trash.
    const claimed = new Map<string, Set<string>>();
    for (const entry of entries) {
        if (entry.deletedAt === null) continue;
        const rows = await entryRepository.findContentRowsByEntry(entry.id);
        for (const row of rows) {
            if (row.stagedFor !== null) continue;
            const reserved = claimed.get(row.locale) ?? new Set<string>();
            claimed.set(row.locale, reserved);
            const slug =
                hasSlug && row.slug !== null
                    ? await entryRepository.uniqueSlug(
                          type,
                          row.locale,
                          row.slug,
                          entry.id,
                          reserved
                      )
                    : null;
            if (slug !== null) reserved.add(slug);
            const data: ParsedEntryUpdateData = {
                ...(statuses && row.status !== 'unpublished'
                    ? { status: 'unpublished' }
                    : {}),
                ...(slug !== null && slug !== row.slug ? { slug } : {}),
            };
            if (Object.keys(data).length === 0) continue;
            await updateEntryBatch(
                {
                    type,
                    ids: [entry.id],
                    locale: row.locale,
                    createMissingLocale: false,
                    data,
                },
                ctx
            );
        }
    }

    return writeBatch(entries, (entry) =>
        entryRepository.trash.restore(entry.id, userId)
    );
}
