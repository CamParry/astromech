/**
 * Status transitions — batch writes over `updateEntryBatch` that move a batch of
 * entries between statuses. A locale with no content row is a not-found error
 * here: only `update` may write a translation.
 *
 * Batch-only: `methods/status.ts` reaches each through `fromBatch`.
 */

import type { AppContext, Entry } from '@/types/index';
import { parseInput } from '@/errors/validation';
import { scheduleEntrySchema } from '../schema';
import { updateEntryBatch } from './update-batch';

/** Publishes a batch of entries by moving them to `published`. */
export async function publishEntryBatch(
    params: { type: string; ids: readonly string[]; locale?: string | undefined },
    ctx: AppContext
): Promise<Entry[]> {
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
export async function unpublishEntryBatch(
    params: { type: string; ids: readonly string[]; locale?: string | undefined },
    ctx: AppContext
): Promise<Entry[]> {
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
export async function scheduleEntryBatch(
    params: {
        type: string;
        ids: readonly string[];
        publishedAt: Date;
        locale?: string | undefined;
    },
    ctx: AppContext
): Promise<Entry[]> {
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
