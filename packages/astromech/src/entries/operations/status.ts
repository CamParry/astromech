/**
 * Status transitions — bulk-capable convenience operations that delegate to
 * `update`. (The §4 tree groups these under `bulk/`; per §6 the bulk dispatch
 * lives in `update`, so they sit here as thin status wrappers.)
 */

import { scheduleEntrySchema } from '../schema.js';
import { validate } from '../internal/validation.js';
import { assertCapability } from '../internal/supports.js';
import { update } from './update.js';
import type { Entry } from '@/types/index.js';

export async function publish(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'statuses');
    return update({
        type: params.type,
        id: params.id,
        data: { status: 'published', publishAt: null },
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
        data: { status: 'unpublished', publishAt: null },
    });
}

export async function schedule(params: {
    type: string;
    id: string | readonly string[];
    publishAt: Date;
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'statuses');
    const validated = validate(scheduleEntrySchema, { publishAt: params.publishAt });
    return update({
        type: params.type,
        id: params.id,
        data: { status: 'scheduled', publishAt: validated.publishAt },
    });
}
