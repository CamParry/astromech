import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema } from '../schema';

/**
 * An update that sets `published`, written atomically across `ids`, so the update
 * hooks fire and the stored fields must be complete. An already-published locale
 * keeps its `publishedAt`; any other is stamped now. A locale with no row throws.
 */
export const publishEntries = defineServiceMethod({
    summary: 'Publish an entry.',
    input: oneOrMany(
        z.strictObject({
            type: z.string(),
            ...batchAddress,
            locale: z.string().optional(),
        })
    ),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryAccess('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return updateOne(
            { ...params, createMissingLocale: false, data: { status: 'published' } },
            ctx
        );
    },
});

const updateOne = fromBatch(updateEntryBatch);
