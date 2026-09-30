import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { resolvePublishedAt } from '@/content/published-at';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { parseInput } from '@/errors/validation';
import { defineServiceMethod } from '@/services/define-service-method';
import { parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { entryAccess } from '../internal/access';
import { prepareEntryFields } from '../internal/prepare-fields';
import { deriveSlug } from '../internal/slug';
import { syncEntryRelationships } from '../relationships';
import { entryRepository } from '../repository/entries-table';
import { createEntryPayloadSchema, createEntrySchema, entrySchema } from '../schema';

/**
 * `data` is parsed under the type's own schema. The slug, given or derived from
 * the title, is made unique in its locale, and the entry create hooks fire
 * around the write.
 */
export const createEntry = defineServiceMethod({
    summary: 'Create an entry.',
    // The titleless payload, since one schema covers every type here; the
    // handler re-parses under the type's own, which is the stricter one.
    input: z.strictObject({ type: z.string(), data: createEntryPayloadSchema }),
    output: entrySchema,
    access: entryAccess('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, data } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const entryType = resolveEntryType(config, type);
        if (!entryType) throw new UnknownEntryTypeError(type);
        const schema = createEntrySchema({ titled: entryType.titleField !== false });

        assertWritableFields(entryType, data);
        const validated = parseInput(schema, {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
        });
        const locale = resolveResourceLocale('entry', config, entryType.id, data.locale);

        const title = validated.title ?? '';
        const status = validated.status ?? 'unpublished';
        const publishedAt = resolvePublishedAt({
            status,
            given: validated.publishedAt,
            current: null,
            now: new Date(),
        });
        const slug = await deriveSlug({ entryType, locale, title, slug: validated.slug });
        const fields = await prepareEntryFields({
            kind: 'create',
            config,
            entryType,
            values: validated.fields ?? {},
            locale,
            entryId: undefined,
            status,
            user,
        });
        const write = {
            title,
            slug,
            locale,
            fields,
            status,
            publishedAt,
            createdBy: userId,
            updatedBy: userId,
        };

        await ctx.runHook('entry:beforeCreate', { type, data: write, user });

        const created = await transaction(async () => {
            const row = await entryRepository.create({ type, ...write });
            await syncEntryRelationships(config, row, type);
            return row;
        });

        await ctx.runHook('entry:afterCreate', {
            type,
            data: write,
            user,
            entry: parseOutput(entrySchema, created, 'The entry in entry:afterCreate'),
        });

        return created;
    },
});
