import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema, scheduleEntrySchema } from '../schema';

/**
 * An update that sets `scheduled` and `publishedAt`, written atomically across
 * `ids`, so the update hooks fire and the stored fields must be complete. The
 * scheduled-publish job publishes it when the time comes. A locale with no row throws.
 */
export const scheduleEntries = defineServiceMethod({
    summary: 'Schedule an entry to publish at a future time.',
    input: oneOrMany(
        z.strictObject({
            type: z.string(),
            ...batchAddress,
            locale: z.string().optional(),
            ...scheduleEntrySchema.shape,
        })
    ),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryAccess('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        const { publishedAt, ...address } = params;

        return updateOne(
            {
                ...address,
                createMissingLocale: false,
                data: { status: 'scheduled', publishedAt },
            },
            ctx
        );
    },
});

const updateOne = fromBatch(updateEntryBatch);
