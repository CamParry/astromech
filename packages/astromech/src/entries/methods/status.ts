/**
 * Status transitions — the three methods that move one entry, or a list of
 * them, between statuses. Each is a `update` write underneath, gated on the
 * `statuses` capability.
 */

import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import {
    publishEntryBatch,
    scheduleEntryBatch,
    unpublishEntryBatch,
} from '../internal/status-batch';
import { entrySchema, scheduleEntrySchema } from '../schema';

/** One id is a batch of one, and its result and errors are unwrapped. */
const publishOne = fromBatch(publishEntryBatch);
const unpublishOne = fromBatch(unpublishEntryBatch);
const scheduleOne = fromBatch(scheduleEntryBatch);

/** What every status method answers: the entry it moved, or the list of them. */
const entryOrEntries = z.union([entrySchema, z.array(entrySchema)]);

/** Publishes one entry or a list of them. */
export const publishEntries = defineServiceMethod({
    summary: 'Publish an entry.',
    input: publishEntriesInput({ type: z.string() }),
    output: entryOrEntries,
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return publishOne(params, ctx);
    },
});

/** Unpublishes one entry or a list of them. */
export const unpublishEntries = defineServiceMethod({
    summary: 'Unpublish an entry.',
    input: unpublishEntriesInput({ type: z.string() }),
    output: entryOrEntries,
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    // Data-losing in the sense the effect hints mean: the entry stops being
    // served. `ServiceMethodEffect` names unpublish explicitly.
    destructive: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return unpublishOne(params, ctx);
    },
});

/** Schedules one entry or a list of them to publish at `publishedAt`. */
export const scheduleEntries = defineServiceMethod({
    summary: 'Schedule an entry to publish at a future time.',
    input: scheduleEntriesInput({ type: z.string() }),
    output: entryOrEntries,
    access: entryGate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return scheduleOne(params, ctx);
    },
});

/**
 * `entries.publish`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function publishEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(localisedBatch(type));
}

/**
 * `entries.unpublish`'s input, with `type` as given: any type id on the method,
 * one type's literal in that type's catalogue.
 */
export function unpublishEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(localisedBatch(type));
}

/**
 * `entries.schedule`'s input, with `type` as given: any type id on the method,
 * one type's literal in that type's catalogue.
 */
export function scheduleEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(localisedBatch(type).extend(scheduleEntrySchema.shape));
}

/** The `{ type, id | ids, locale }` every status method is addressed by. */
function localisedBatch<T extends z.ZodType>(type: T) {
    return z.strictObject({ type, ...batchAddress, locale: z.string().optional() });
}
