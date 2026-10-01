import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { entryAccess } from '../internal/access';
import { prepareEntryRow } from '../internal/prepare-row';
import { syncEntryRelationships } from '../relationships';
import { entryRepository } from '../repository/entries-table';
import { createEntryPayloadSchema, entrySchema } from '../schema';

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
        const entryType = resolveEntryType(config, type);
        if (!entryType) throw new UnknownEntryTypeError(type);

        assertWritableFields(entryType, data);
        const locale = resolveResourceLocale('entry', config, entryType.id, data.locale);

        const write = await prepareEntryRow({
            config,
            entryType,
            locale,
            entryId: undefined,
            data,
            current: null,
            user,
        });

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
