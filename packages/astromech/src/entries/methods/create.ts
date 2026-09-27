import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { parseInput } from '@/errors/validation';
import { defineServiceMethod } from '@/services/define-service-method';
import { parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { entryGate } from '../internal/access';
import { deriveSlug } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { syncEntryRelationships } from '../relationships';
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
    input: createEntryInput({ type: z.string(), data: createEntryPayloadSchema }),
    output: entrySchema,
    access: entryGate('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, data } = params;
        const { config, user } = ctx;
        // Null outside a request: a seed script, the CLI and the scheduler all
        // write entries with no identity to record.
        const userId = user?.id ?? null;

        const entryType = resolveEntryType(config, type);
        if (!entryType) {
            throw new UnknownEntryTypeError(type);
        }

        assertWritableFields(entryType, data);

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
            config,
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
            config,
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
            createdBy: userId,
            updatedBy: userId,
        };

        await ctx.runHook('entry:beforeCreate', { type, data: row, user });

        // Write the row and its relationship index atomically.
        const entry = await transaction(async () => {
            const created = await entryRepository.create({ type, ...row });
            await syncEntryRelationships(config, created, type);
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

/**
 * `entries.create`'s input, with `type` and `data` as given: any type id and the
 * titleless payload on the method, one type's literal and its own create schema
 * in that type's catalogue.
 */
export function createEntryInput<T extends z.ZodType, D extends z.ZodType>({
    type,
    data,
}: {
    type: T;
    data: D;
}) {
    return z.strictObject({ type, data });
}
