import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { asEntry } from '../../internal/records';
import { resolveStagingTarget } from '../../internal/staging';

/**
 * Returns the staged copy of one locale of an entry, or null if none exists.
 * Throws if the entry does not exist in that locale or is the wrong type.
 */
export const getStagedEntry = defineServiceMethod({
    summary: 'Get the staged change of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    access: entryGate('read'),
    requires: 'staging',
    mutates: false,
    async handler(params, ctx): Promise<Entry | null> {
        const { staging, canonical } = await resolveStagingTarget(ctx.config, params);
        const staged = await staging.getByCanonical(params.id, canonical.locale);
        return staged ? asEntry(staged) : null;
    },
});
