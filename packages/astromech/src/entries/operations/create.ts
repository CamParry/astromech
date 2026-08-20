import type { EntryRepository } from '../repository/types';
import type {
    Entry,
    EntryCreateParams,
    EntryStatus,
    JsonObject,
    ResolvedEntryType,
} from '@/types/index';
import { getConfig } from '@/config/registry';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/parse-fields';
import { runHook } from '@/hooks/index';
import { getCurrentUser } from '@/request-context/index';
import { UnknownEntryTypeError } from '../errors';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { deriveSlug } from '../internal/slug';
import { inheritSharedFields } from '../internal/translatable';
import { getDefaultLocale } from '../internal/type-config';
import { validate } from '../internal/validate';
import { createEntryLookups } from '../lookups';
import { getEntryRepository } from '../repository/registry';
import { createEntrySchema } from '../schema';
import { entryValidationMode } from '../validation-mode.shared';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/** What the field helper below needs to know about the write in progress. */
type FieldContext = {
    entryType: ResolvedEntryType;
    repository: EntryRepository;
    locale: string;
    localeGroup: string | undefined;
    status: EntryStatus;
};

/**
 * Creates an entry of the given type: validates input, fills defaults, runs
 * the entry create hooks, and writes the row with its relationship index.
 */
export async function create(params: EntryCreateParams): Promise<Entry> {
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }

    const type = params.type;
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) {
        throw new UnknownEntryTypeError(type);
    }

    const repository = getEntryRepository(type);
    const user = await getCurrentUser();

    const titled = entryType.titleField !== false;
    const validated = validate(createEntrySchema({ titled }), {
        title: params.title,
        slug: params.slug,
        fields: params.fields,
        status: params.status,
        publishedAt: params.publishedAt,
    });

    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const locale = params.locale ?? getDefaultLocale();
    const localeGroup = params.localeGroup;
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishedAt ?? null);

    const slug = await deriveSlug({
        repository,
        entryType,
        locale,
        title,
        slug: validated.slug,
    });

    const fields = await toStoredFields(validated.fields ?? {}, {
        entryType,
        repository,
        locale,
        localeGroup,
        status,
    });

    const data = {
        title,
        slug,
        locale,
        localeGroup,
        fields,
        status,
        publishedAt,
    };

    await runHook('entry:beforeCreate', { type, data, user });

    // Write the row and its relationship index atomically.
    const entry = await transaction(async () => {
        const created = asEntry(await repository.create({ type, ...data }));
        await indexEntryRelationships(created, data.fields, type);
        return created;
    });

    await runHook('entry:afterCreate', { type, data, user, entry });

    return entry;
}

/**
 * Converts field values into the values to store: inherits the locale group's
 * shared values, coerces and validates every value, and drops dead relation ids.
 * Throws a 422 when a field or the type's own validator reports.
 */
async function toStoredFields(
    values: Record<string, unknown>,
    context: FieldContext
): Promise<JsonObject> {
    const { entryType, repository, locale, localeGroup, status } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const withShared = await inheritSharedFields(values, definitions, {
        repository,
        entryType,
        localeGroup,
    });

    const resourceValidate = entryType.validate;
    const parsed = await parseFields(withShared, definitions, {
        operation: 'create',
        validation: entryValidationMode({
            status,
            hasStatuses: entryType.capabilities.statuses !== false,
        }),
        resource: { kind: 'entry', record: null },
        user: await getCurrentUser(),
        lookups: createEntryLookups(repository, { type: entryType.id, locale }),
        ...(resourceValidate ? { resourceValidate } : {}),
    });

    assertNoFieldErrors(parsed);

    const pruned = await pruneDanglingRelations(definitions, parsed.values as JsonObject);
    return pruned.values;
}
