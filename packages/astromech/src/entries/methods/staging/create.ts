import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { toEntry } from '../../internal/read-entry';
import { syncEntryRelationships } from '../../internal/relationships';
import { resolveStagingTarget } from '../../internal/staging';

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
        const { staging, canonical } = await resolveStagingTarget(ctx.config, params);
        const user = ctx.user;

        const existing = await staging.findOne({ id, locale: canonical.locale });
        if (existing) {
            throw new StagedChangeExistsError('entry', { id, locale: canonical.locale });
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

        return toEntry(created);
    },
});
