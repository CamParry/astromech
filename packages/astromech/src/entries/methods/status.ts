/**
 * Status transitions — the three methods that move one entry, or a list of
 * them, between statuses. Each is a `update` write underneath, gated on the
 * `statuses` capability.
 */

import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { fromBatch } from '../internal/from-batch';
import {
    publishEntryBatch,
    scheduleEntryBatch,
    unpublishEntryBatch,
} from '../internal/status-batch';
import { scheduleEntrySchema } from '../schema';

/** One id is a batch of one, and its result and errors are unwrapped. */
const publishOne = fromBatch(publishEntryBatch);
const unpublishOne = fromBatch(unpublishEntryBatch);
const scheduleOne = fromBatch(scheduleEntryBatch);

/** The `{ type, id, locale }` every status method is addressed by. */
const localisedBatch = z.object({
    type: z.string(),
    id: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    locale: z.string().optional(),
});

/** Publishes one entry or a list of them. */
export const publishEntries = defineServiceMethod({
    summary: 'Publish an entry.',
    input: localisedBatch,
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(
        params: { type: string; id: string | readonly string[]; locale?: string },
        ctx
    ): Promise<Entry | Entry[]> {
        return publishOne(params, ctx);
    },
});

/** Unpublishes one entry or a list of them. */
export const unpublishEntries = defineServiceMethod({
    summary: 'Unpublish an entry.',
    input: localisedBatch,
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    // Data-losing in the sense the effect hints mean: the entry stops being
    // served. `ServiceMethodEffect` names unpublish explicitly.
    destructive: true,
    idempotent: true,
    handler(
        params: { type: string; id: string | readonly string[]; locale?: string },
        ctx
    ): Promise<Entry | Entry[]> {
        return unpublishOne(params, ctx);
    },
});

/** Schedules one entry or a list of them to publish at `publishedAt`. */
export const scheduleEntries = defineServiceMethod({
    summary: 'Schedule an entry to publish at a future time.',
    input: localisedBatch.extend(scheduleEntrySchema.shape),
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(
        params: {
            type: string;
            id: string | readonly string[];
            publishedAt: Date;
            locale?: string;
        },
        ctx
    ): Promise<Entry | Entry[]> {
        return scheduleOne(params, ctx);
    },
});
