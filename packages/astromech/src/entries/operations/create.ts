import { getCurrentUser } from '@/request-context/index';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime';
import { createEntrySchema } from '../schema';
import { getEntryStorage } from '../storage/registry';
import { validate } from '../internal/validate';
import { getDefaultLocale } from '../internal/type-config';
import { deriveSlug } from '../internal/slug';
import { inheritSharedFields } from '../internal/translatable';
import { indexEntryRelationships } from '../internal/relationships';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry } from '../internal/records';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';
import { UnknownEntryTypeError } from '../errors';
import { createEntryLookups } from '../lookups';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { entryValidationMode } from '../validation-mode.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/pipeline';
import { getConfig } from '@/config/registry';
import type { EntryStorage, EntryWrite, StorageDb } from '../storage/types';
import type {
    Entry,
    EntryCreateParams,
    EntryStatus,
    JsonObject,
    ResolvedEntryType,
} from '@/types/index';

/** What the field helper below needs to know about the write in progress. */
type FieldContext = {
    entryType: ResolvedEntryType;
    storage: EntryStorage;
    locale: string;
    localeGroup: string | undefined;
    status: EntryStatus;
};

/**
 * Creates an entry of the given type: validates input, fills defaults, runs
 * the entry create hooks, and writes the row with its relationship index.
 */
export async function create(params: EntryCreateParams): Promise<Entry> {
    // Guards
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }

    const type = params.type;
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) {
        throw new UnknownEntryTypeError(type);
    }

    // Lookups
    const storage = getEntryStorage(type);
    const user = getCurrentUser();

    // Validation
    const titled = entryType.titleField !== false;
    const validated = validate(createEntrySchema({ titled }), {
        title: params.title,
        slug: params.slug,
        fields: params.fields,
        status: params.status,
        publishedAt: params.publishedAt,
    });

    // Defaults
    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const locale = params.locale ?? getDefaultLocale();
    const localeGroup = params.localeGroup;
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishedAt ?? null);

    const slug = await deriveSlug({
        storage,
        entryType,
        locale,
        title,
        slug: validated.slug,
    });

    const fields = await toStoredFields(validated.fields ?? {}, {
        entryType,
        storage,
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

    await runBeforeHooks('entry:beforeCreate', { type, data, user }, user);

    const entry = await persistEntry(storage, type, data);

    await runAfterHooks('entry:afterCreate', { type, data, user, entry }, user);

    return entry;
}

/**
 * Converts field values for storage: inherits the locale group's shared
 * values, coerces and validates every value, and drops dead relation ids.
 * Throws a 422 when a field or the type's own validator reports.
 */
async function toStoredFields(
    values: Record<string, unknown>,
    context: FieldContext
): Promise<JsonObject> {
    const { entryType, storage, locale, localeGroup, status } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const withShared = await inheritSharedFields(values, definitions, {
        storage,
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
        user: getCurrentUser(),
        lookups: createEntryLookups(storage, { type: entryType.id, locale }),
        ...(resourceValidate ? { resourceValidate } : {}),
    });

    assertNoFieldErrors(parsed);

    const pruned = await pruneDanglingRelations(definitions, parsed.values as JsonObject);
    return pruned.values;
}

/**
 * Writes the row and its relationship index rows, in one transaction when the
 * storage has one and sequentially when it does not.
 */
async function persistEntry(
    storage: EntryStorage,
    type: string,
    data: EntryWrite & { fields: JsonObject }
): Promise<Entry> {
    const write = async (
        txStorage: EntryStorage,
        txDb: StorageDb | undefined
    ): Promise<Entry> => {
        const entry = asEntry(await txStorage.create({ type, ...data }));
        await indexEntryRelationships(entry, data.fields, type, txDb);
        return entry;
    };
    return storage.transaction ? storage.transaction(write) : write(storage, undefined);
}
