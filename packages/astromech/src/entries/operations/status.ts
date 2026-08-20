/**
 * Status transitions — bulk-capable convenience wrappers that delegate to
 * `update`, which owns the bulk dispatch.
 */

import type { Entry } from '@/types/index';
import { assertCapability } from '../internal/type-config';
import { validate } from '../internal/validate';
import { scheduleEntrySchema } from '../schema';
import { update } from './update';

/**
 * Publishes one entry or many by moving them to `published`. Throws if the
 * type does not support statuses.
 */
export async function publish(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'statuses');
    return update({
        type: params.type,
        id: params.id,
        data: { status: 'published', publishedAt: null },
    });
}

/**
 * Unpublishes one entry or many by moving them to `unpublished`. Throws if the
 * type does not support statuses.
 */
export async function unpublish(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'statuses');
    return update({
        type: params.type,
        id: params.id,
        data: { status: 'unpublished', publishedAt: null },
    });
}

/**
 * Schedules one entry or many to publish at `publishedAt`. Throws if the type
 * does not support statuses, or a 422 when the date fails validation.
 */
export async function schedule(params: {
    type: string;
    id: string | readonly string[];
    publishedAt: Date;
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'statuses');
    const validated = validate(scheduleEntrySchema, { publishedAt: params.publishedAt });
    return update({
        type: params.type,
        id: params.id,
        data: { status: 'scheduled', publishedAt: validated.publishedAt },
    });
}
