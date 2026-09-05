import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { CapabilityError } from '../../errors';
import { entryGate } from '../../internal/access';
import { assertCapability } from '../../internal/entry-type';
import { asEntry, getEntryOfType } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';

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
    async handler(
        params: {
            type: string;
            id: string;
            locale?: string;
        },
        ctx
    ): Promise<Entry | null> {
        const { type, id } = params;
        const repository = getEntryRepository(type);
        assertCapability(ctx.config, type, 'staging');
        const { staging } = repository;
        if (!staging) throw new CapabilityError(type, 'staging');
        const canonical = await getEntryOfType(
            ctx.config,
            repository,
            type,
            id,
            params.locale
        );
        const staged = await staging.getByCanonical(id, canonical.locale);
        return staged ? asEntry(staged) : null;
    },
});
