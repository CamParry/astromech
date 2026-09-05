import type { Entry, EntryCreateData } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { isPublicBranded, PublicShapeWriteError } from '@/content/visibility';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { parseInput, ValidationError } from '@/errors/validation';
import { defineServiceMethod } from '@/services/define-service-method';
import { UnknownEntryTypeError } from '../errors';
import { entryGate } from '../internal/access';
import { asEntry } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { deriveSlug } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { getEntryRepository } from '../repository/registry';
import { createEntrySchema } from '../schema';

/**
 * The `data` slot, declared as what it describes rather than inferred: the
 * schema parses `fields` as `Record<string, unknown>`, which
 * `exactOptionalPropertyTypes` keeps distinct from `EntryCreateData`'s
 * `fields?: JsonObject`. The titled shape stands in for every type here — the
 * per-type catalogue declares the schema the type actually has.
 */
const createData = createEntrySchema({
    titled: true,
}) as unknown as z.ZodType<EntryCreateData>;

/**
 * Creates an entry of the given type: validates input, fills defaults, runs
 * the entry create hooks, and writes the row with its relationship index.
 */
export const createEntry = defineServiceMethod({
    summary: 'Create an entry.',
    input: z.object({ type: z.string(), data: createData }),
    access: entryGate('create'),
    mutates: true,
    async handler(params: { type: string; data: EntryCreateData }, ctx): Promise<Entry> {
        const { type, data } = params;

        if (data.fields !== undefined && isPublicBranded(data.fields)) {
            throw new PublicShapeWriteError();
        }

        const entryType = resolveEntryType(ctx.config, type);
        if (!entryType) {
            throw new UnknownEntryTypeError(type);
        }

        const repository = getEntryRepository(type);
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
        const defaultLocale = defaultContentLocale(ctx.config);
        const locale = data.locale ?? defaultLocale;
        if (locale !== defaultLocale && !entryType.translatable) {
            throw ValidationError.fromFieldErrors({}, [
                `Entry type '${entryType.id}' is not translatable, so only the ` +
                    `'${defaultLocale}' locale can be written.`,
            ]);
        }
        const publishedAt =
            status === 'published' ? new Date() : (validated.publishedAt ?? null);

        const slug = await deriveSlug({
            repository,
            entryType,
            locale,
            title,
            slug: validated.slug,
        });

        const fields = await toStoredFields({
            kind: 'create',
            config: ctx.config,
            repository,
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
            const created = asEntry(await repository.create({ type, ...row }));
            await indexEntryRelationships(ctx.config, created, row.fields, type);
            return created;
        });

        await ctx.runHook('entry:afterCreate', { type, data: row, user, entry });

        return entry;
    },
});
