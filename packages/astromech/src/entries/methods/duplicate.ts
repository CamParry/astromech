import type { EntryRowWrite } from '../internal/prepare-row';
import type { EntryResource } from '../repository/types';
import type {
    EntryDuplicateOverrides,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { entryAccess } from '../internal/access';
import { prepareEntryRow } from '../internal/prepare-row';
import { getEntryOfType, getEntryResource } from '../read-entry';
import { syncEntryRelationships } from '../relationships';
import { entryRepository } from '../repository/entries-table';
import { duplicateOverridesSchema, entrySchema } from '../schema';

/**
 * Copies every locale, or only `overrides.locale`, into a new entry of the same
 * type, `unpublished` unless `overrides` says otherwise. Each locale is prepared
 * as `create` prepares a row, and the create hooks fire once, with the first.
 */
export const duplicateEntry = defineServiceMethod({
    summary:
        'Copy an entry into a new one. An override status other than ' +
        '`unpublished`, or a `publishedAt`, also needs the publish permission.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        overrides: duplicateOverridesSchema.optional(),
    }),
    output: entrySchema,
    access: entryAccess('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id, overrides = {} } = params;
        const { config, user } = ctx;
        const entryType = resolveEntryType(config, type);
        if (!entryType) throw new UnknownEntryTypeError(type);
        const copy = { config, entryType, overrides, user };

        assertWritableFields(entryType, overrides);
        const source = overrides.locale
            ? await getEntryOfType(type, id, overrides.locale)
            : await getEntryResource(type, id);
        const otherLocales = overrides.locale
            ? []
            : source.locales.filter((locale) => locale !== source.locale);

        const first = await prepareCopy({ ...copy, row: source });
        const rest: EntryRowWrite[] = [];
        for (const locale of otherLocales) {
            const row = await getEntryOfType(type, id, locale);
            rest.push(await prepareCopy({ ...copy, row }));
        }

        await ctx.runHook('entry:beforeCreate', { type, data: first, user });

        const created = await transaction(async () => {
            const row = await entryRepository.create({ type, ...first });
            for (const write of rest) {
                await entryRepository.update({ id: row.id, locale: write.locale }, write);
            }
            // Once, at the end: the index is per entry and reads every locale back.
            await syncEntryRelationships(config, row);
            // Re-read so `locales` names every copied locale, not just the first.
            return getEntryOfType(type, row.id, first.locale);
        });

        await ctx.runHook('entry:afterCreate', {
            type,
            data: first,
            user,
            entry: parseOutput(entrySchema, created, 'The entry in entry:afterCreate'),
        });

        return created;
    },
});

/** The row one locale of the source writes into the copy, `overrides` over it. */
function prepareCopy(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    overrides: EntryDuplicateOverrides;
    user: User | null;
    row: EntryResource;
}): Promise<EntryRowWrite> {
    const { config, entryType, overrides, user, row } = params;
    return prepareEntryRow({
        config,
        entryType,
        locale: row.locale,
        entryId: undefined,
        data: {
            title: overrides.title ?? row.title,
            slug: overrides.slug ?? row.slug ?? undefined,
            fields: { ...row.fields, ...overrides.fields },
            status: overrides.status ?? 'unpublished',
            publishedAt: overrides.publishedAt,
        },
        // A copy is a new row, so it has no date of its own to keep.
        current: null,
        user,
    });
}
