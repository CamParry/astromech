import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { parseInput } from '@/errors/validation';
import { defineServiceMethod } from '@/services/define-service-method';
import { parseOutput } from '@/services/parse-method-output';
import { UnknownEntryTypeError } from '../errors';
import { entryGate } from '../internal/access';
import { assertWritableFields } from '../internal/entry-type';
import { syncEntryRelationships } from '../internal/relationships';
import { deriveSlug } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { entryRepository } from '../repository/entries-table';
import { createEntryPayloadSchema, createEntrySchema, entrySchema } from '../schema';

/**
 * Creates an entry of the given type: validates input, fills defaults, runs
 * the entry create hooks, and writes the row with its relationship index.
 */
export const createEntry = defineServiceMethod({
    summary: 'Create an entry.',
    // The titleless payload, since one schema covers every type here; the
    // handler re-parses under the type's own, which is the stricter one.
    input: z.object({ type: z.string(), data: createEntryPayloadSchema }),
    output: entrySchema,
    access: entryGate('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, data } = params;

        const entryType = resolveEntryType(ctx.config, type);
        if (!entryType) {
            throw new UnknownEntryTypeError(type);
        }

        assertWritableFields(entryType, data);
        const user = ctx.user;

        const titled = entryType.titleField !== false;
        const validated = parseInput(createEntrySchema({ titled }), {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
        });

        const title = validated.title ?? '';
        const status = validated.status ?? 'unpublished';
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.entry,
            ctx.config,
            entryType.id,
            data.locale
        );
        const publishedAt =
            status === 'published' ? new Date() : (validated.publishedAt ?? null);

        const slug = await deriveSlug({
            entryType,
            locale,
            title,
            slug: validated.slug,
        });

        const fields = await toStoredFields({
            kind: 'create',
            config: ctx.config,
            entryType,
            values: validated.fields ?? {},
            locale,
            entryId: undefined,
            status,
            user,
        });

        const row = {
            title,
            slug,
            locale,
            fields,
            status,
            publishedAt,
            // Null outside a request: a seed script, the CLI and the scheduler all
            // write entries with no identity to record.
            createdBy: user?.id ?? null,
            updatedBy: user?.id ?? null,
        };

        await ctx.runHook('entry:beforeCreate', { type, data: row, user });

        // Write the row and its relationship index atomically.
        const entry = await transaction(async () => {
            const created = await entryRepository.create({ type, ...row });
            await syncEntryRelationships(ctx.config, created, type);
            return created;
        });

        await ctx.runHook('entry:afterCreate', {
            type,
            data: row,
            user,
            entry: parseOutput(entrySchema, entry, 'The entry in entry:afterCreate'),
        });

        return entry;
    },
});
