import type { Entry, EntryCreateParams } from '@/types/index';
import { getConfig } from '@/config/registry';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { parseInput, ValidationError } from '@/errors/validation';
import { runHook } from '@/hooks/hooks';
import { getCurrentUser } from '@/request-context/request-context';
import { UnknownEntryTypeError } from '../errors';
import { getDefaultContentLocale } from '../internal/entry-type';
import { asEntry } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { deriveSlug } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { getEntryRepository } from '../repository/registry';
import { createEntrySchema } from '../schema';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/**
 * Creates an entry of the given type: validates input, fills defaults, runs
 * the entry create hooks, and writes the row with its relationship index.
 */
export async function createEntry(params: EntryCreateParams): Promise<Entry> {
    const { type, data } = params;

    if (data.fields !== undefined && isPublicBranded(data.fields)) {
        throw new PublicShapeWriteError();
    }

    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) {
        throw new UnknownEntryTypeError(type);
    }

    const repository = getEntryRepository(type);
    const user = await getCurrentUser();

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
    const defaultLocale = getDefaultContentLocale();
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
        repository,
        entryType,
        values: validated.fields ?? {},
        locale,
        entryId: undefined,
        status,
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

    await runHook('entry:beforeCreate', { type, data: row, user });

    // Write the row and its relationship index atomically.
    const entry = await transaction(async () => {
        const created = asEntry(await repository.create({ type, ...row }));
        await indexEntryRelationships(created, row.fields, type);
        return created;
    });

    await runHook('entry:afterCreate', { type, data: row, user, entry });

    return entry;
}
