import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Creates a staged copy of one locale of an entry so edits can be drafted off
 * the live row. Throws if that locale already has a staged change.
 */
export const createStagedEntry = defineServiceMethod({
    summary: 'Stage a change to an entry.',
    input: createStagedEntryInput({ type: z.string() }),
    output: entrySchema,
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id } = params;
        const canonical = await getEntryOfType(type, id, params.locale);
        const { staging } = entryRepository;
        const user = ctx.user;

        const existing = await staging.findOne({ id, locale: canonical.locale });
        if (existing) {
            throw new StagedChangeExistsError('entry', { id, locale: canonical.locale });
        }

        // The staged row copies the canonical's content — slug included, which the
        // partial unique index allows — and is always unpublished. Write it and its
        // relationship index atomically.
        return transaction(async () => {
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
            await syncEntryRelationships(ctx.config, row, type);
            return row;
        });
    },
});

/**
 * `entries.createStaged`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function createStagedEntryInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string(), locale: z.string().optional() });
}
