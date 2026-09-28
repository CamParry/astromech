import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { fromBatch, localisedBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema } from '../schema';

/**
 * An update that sets `unpublished` and clears `publishedAt`, written atomically
 * across `ids`, so the update hooks fire. A locale with no row throws.
 */
export const unpublishEntries = defineServiceMethod({
    summary: 'Unpublish an entry.',
    input: unpublishEntriesInput({ type: z.string() }),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryAccess('publish'),
    requires: 'statuses',
    mutates: true,
    // The entry stops being served, which `ServiceMethodEffect` counts as destructive.
    destructive: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return updateOne(
            { ...params, createMissingLocale: false, data: { status: 'unpublished' } },
            ctx
        );
    },
});

/**
 * `entries.unpublish`'s input, with `type` as given: any type id on the method,
 * one type's literal in that type's catalogue.
 */
export function unpublishEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(localisedBatch(type));
}

const updateOne = fromBatch(updateEntryBatch);
