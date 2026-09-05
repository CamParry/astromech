import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { fromBatch } from '../internal/from-batch';
import { restoreEntryBatch } from '../internal/restore-batch';

/** One id is a batch of one, and its result and errors are unwrapped. */
const restoreOne = fromBatch(restoreEntryBatch);

/**
 * Restore one trashed entry or a list of them, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * Throws if the type does not support trash.
 */
export const restoreEntries = defineServiceMethod({
    summary: 'Restore a trashed entry.',
    input: z.object({
        type: z.string(),
        id: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    }),
    access: entryGate('update'),
    requires: 'trash',
    mutates: true,
    idempotent: true,
    handler(
        params: { type: string; id: string | readonly string[] },
        ctx
    ): Promise<Entry | Entry[]> {
        return restoreOne(params, ctx);
    },
});
