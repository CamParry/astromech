/**
 * Status transitions — bulk-capable convenience operations that delegate to
 * `update`. (The §4 tree groups these under `bulk/`; per §6 the bulk dispatch
 * lives in `update`, so they sit here as thin status wrappers.)
 */

import type { Entry } from '@/types/index';
import { assertCapability } from '../internal/type-config';
import { validate } from '../internal/validate';
import { scheduleEntrySchema } from '../schema';
import { update } from './update';

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
