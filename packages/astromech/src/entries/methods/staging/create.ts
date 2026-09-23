import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { CapabilityError } from '@/errors/capability';
import { defineServiceMethod } from '@/services/define-service-method';
import { StagedEntryExistsError } from '../../errors';
import { entryGate } from '../../internal/access';
import { asEntry, getEntryOfType } from '../../internal/records';
import { syncEntryRelationships } from '../../internal/relationships';
import { getEntryRepository } from '../../repository/registry';

/**
 * Creates a staged copy of one locale of an entry so edits can be drafted off
 * the live row. Throws if that locale already has a staged change.
 */
export const createStagedEntry = defineServiceMethod({
    summary: 'Stage a change to an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<Entry> {
        const { type, id } = params;

        const repository = getEntryRepository(type);
        const { staging } = repository;
        if (!staging) throw new CapabilityError('entry', type, 'staging');

        const canonical = await getEntryOfType(
            ctx.config,
            repository,
            type,
            id,
            params.locale
        );
        const user = ctx.user;

        const existing = await staging.getByCanonical(id, canonical.locale);
        if (existing) {
            throw new StagedEntryExistsError({
                canonicalId: id,
                locale: canonical.locale,
            });
        }

        // The staged row copies the canonical's content — slug included, which the
        // partial unique index allows — and is always unpublished. Write it and its
        // relationship index atomically.
        const created = await transaction(async () => {
            const row = await staging.create(
                { id, locale: canonical.locale },
                {
                    title: canonical.title,
                    slug: canonical.slug,
                    fields: canonical.fields,
                    status: 'unpublished',
                    publishedAt: null,
                    createdBy: user?.id ?? null,
                    updatedBy: user?.id ?? null,
                }
            );
            await syncEntryRelationships(ctx.config, row, canonical.fields, type);
            return row;
        });

        return asEntry(created);
    },
});
