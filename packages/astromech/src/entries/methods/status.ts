/**
 * Status transitions: the three methods that move one entry, or a list of them,
 * between statuses. Each is an `update` write underneath, gated on `statuses`; a
 * locale with no content row is a not-found error, since only `update` may add one.
 */

import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { parseInput } from '@/errors/validation';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema, scheduleEntrySchema } from '../schema';

/** Publishes a batch of entries by moving them to `published`. */
async function publishEntryBatch(
    params: { type: string; ids: readonly string[]; locale?: string | undefined },
    ctx: AppContext
): Promise<EntryResource[]> {
    return updateEntryBatch(
        {
            type: params.type,
            ids: params.ids,
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
            createMissingLocale: false,
            data: { status: 'published', publishedAt: null },
        },
        ctx
    );
}

/** Unpublishes a batch of entries by moving them to `unpublished`. */
async function unpublishEntryBatch(
    params: { type: string; ids: readonly string[]; locale?: string | undefined },
    ctx: AppContext
): Promise<EntryResource[]> {
    return updateEntryBatch(
        {
            type: params.type,
            ids: params.ids,
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
            createMissingLocale: false,
            data: { status: 'unpublished', publishedAt: null },
        },
        ctx
    );
}

/**
 * Schedules a batch of entries to publish at `publishedAt`. Throws a 422 when
 * the date fails validation.
 */
async function scheduleEntryBatch(
    params: {
        type: string;
        ids: readonly string[];
        publishedAt: Date;
        locale?: string | undefined;
    },
    ctx: AppContext
): Promise<EntryResource[]> {
    const validated = parseInput(scheduleEntrySchema, {
        publishedAt: params.publishedAt,
    });
    return updateEntryBatch(
        {
            type: params.type,
            ids: params.ids,
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
            createMissingLocale: false,
            data: { status: 'scheduled', publishedAt: validated.publishedAt },
        },
        ctx
    );
}

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
