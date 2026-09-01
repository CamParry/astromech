/**
 * Status transitions — convenience wrappers over `updateEntries` that move a
 * batch of entries between statuses. A locale with no content row is a
 * not-found error here: only `update` may write a translation.
 */

import type { Entry } from '@/types/index';
import { parseInput } from '@/errors/validation';
import { assertCapability } from '../internal/entry-type';
import { scheduleEntrySchema } from '../schema';
import { updateEntries } from './update';

/**
 * Publishes a batch of entries by moving them to `published`. Throws if the
 * type does not support statuses.
 */
export async function publishEntries(params: {
    type: string;
    ids: readonly string[];
    locale?: string;
}): Promise<Entry[]> {
    assertCapability(params.type, 'statuses');
    return updateEntries({
        type: params.type,
        ids: params.ids,
        ...(params.locale !== undefined ? { locale: params.locale } : {}),
        createMissingLocale: false,
        data: { status: 'published', publishedAt: null },
    });
}

/**
 * Unpublishes a batch of entries by moving them to `unpublished`. Throws if the
 * type does not support statuses.
 */
export async function unpublishEntries(params: {
    type: string;
    ids: readonly string[];
    locale?: string;
}): Promise<Entry[]> {
    assertCapability(params.type, 'statuses');
    return updateEntries({
        type: params.type,
        ids: params.ids,
        ...(params.locale !== undefined ? { locale: params.locale } : {}),
        createMissingLocale: false,
        data: { status: 'unpublished', publishedAt: null },
    });
}

/**
 * Schedules a batch of entries to publish at `publishedAt`. Throws if the type
 * does not support statuses, or a 422 when the date fails validation.
 */
export async function scheduleEntries(params: {
    type: string;
    ids: readonly string[];
    publishedAt: Date;
    locale?: string;
}): Promise<Entry[]> {
    assertCapability(params.type, 'statuses');
    const validated = parseInput(scheduleEntrySchema, {
        publishedAt: params.publishedAt,
    });
    return updateEntries({
        type: params.type,
        ids: params.ids,
        ...(params.locale !== undefined ? { locale: params.locale } : {}),
        createMissingLocale: false,
        data: { status: 'scheduled', publishedAt: validated.publishedAt },
    });
}
