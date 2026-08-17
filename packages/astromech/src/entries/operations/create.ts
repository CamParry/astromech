import { getCurrentUser } from '@/request-context/index';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime';
import { slugify } from '@/utilities/strings';
import { createEntrySchema } from '../schema';
import { getEntryStorage } from '../storage/registry';
import { validate } from '../internal/validate';
import {
    getDefaultLocale,
    getNonTranslatableFieldNames,
    isTitled,
} from '../internal/type-config';
import { indexEntryRelationships } from '../internal/relationships';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry } from '../internal/records';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';
import { UnknownEntryTypeError } from '../errors';
import { createEntryLookups } from '../lookups';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { entryValidationMode } from '../validation-mode.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/pipeline';
import { ValidationError } from '@/errors/index';
import { getConfig } from '@/config/registry';
import type { EntryStorage, EntryWrite, StorageDb } from '../storage/types';
import type {
    Entry,
    EntryStatus,
    JsonObject,
    ResolvedEntryType,
    User,
} from '@/types/index';

/** What both field helpers below need to know about the write in progress. */
type FieldContext = {
    entryType: ResolvedEntryType;
    storage: EntryStorage;
    type: string;
    locale: string;
    localeGroup: string | undefined;
    status: EntryStatus;
    user: User | null;
};

/**
 * Create an entry of the given type: validate the input, fill defaults, run
 * the entry create hooks, and write the row with its relationship index.
 */
export async function create(params: {
    type: string;
    title?: string;
    slug?: string;
    locale?: string;
    localeGroup?: string;
    fields?: JsonObject;
    status?: EntryStatus;
    publishedAt?: Date | null;
}): Promise<Entry> {
    // Guards
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }
    const type = params.type;
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) throw new UnknownEntryTypeError(type);

    // Lookups
    const storage = getEntryStorage(type);
    const user = getCurrentUser();

    // Validation
    const titled = isTitled(type);
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
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishedAt ?? null);
    const locale = params.locale ?? getDefaultLocale();
    const localeGroup = params.localeGroup;

    // Slug
    const slug = await deriveSlug({
        storage,
        entryType,
        type,
        locale,
        titled,
        title,
        slug: validated.slug,
    });

    // Fields
    const fields = await toStoredFields(validated.fields ?? {}, {
        entryType,
        storage,
        type,
        locale,
        localeGroup,
        status,
        user,
    });

    // Data
    const data = {
        title,
        slug,
        locale,
        localeGroup,
        fields,
        status,
        publishedAt,
    };

    // Hooks
    await runBeforeHooks('entry:beforeCreate', { type, data, user }, user);

    // Persist
    const entry = await persistEntry(storage, type, data);
    await runAfterHooks('entry:afterCreate', { type, data, user, entry }, user);

    return entry;
}

/**
 * The slug the new entry stores: the caller's, else one slugified from a
 * titled type's title, made unique per (type, locale). Null when the type has
 * no slug capability or there is nothing to slugify.
 */
async function deriveSlug(params: {
    storage: EntryStorage;
    entryType: ResolvedEntryType;
    type: string;
    locale: string;
    titled: boolean;
    title: string;
    slug: string | undefined;
}): Promise<string | null> {
    const { storage, entryType, type, locale, titled, title, slug } = params;
    if (!entryType.capabilities.slug) return null;
    const source = slug ?? (titled ? slugify(title) : null);
    if (!source) return null;
    return storage.uniqueSlug(type, locale, source);
}

/**
 * Field values as they will be stored: the locale group's shared values
 * inherited, every value coerced and validated, dead relation ids dropped.
 * Throws a 422 if a field or the type's own validator reports.
 */
async function toStoredFields(
    values: Record<string, unknown>,
    context: FieldContext
): Promise<JsonObject> {
    const { entryType, storage, type, locale, status, user } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const withShared = await inheritSharedFields(values, definitions, context);

    const resourceValidate = entryType.validate;
    const parsed = await parseFields(withShared, definitions, {
        operation: 'create',
        validation: entryValidationMode({
            status,
            hasStatuses: entryType.capabilities.statuses !== false,
        }),
        resource: { kind: 'entry', record: null },
        user,
        lookups: createEntryLookups(storage, { type, locale }),
        ...(resourceValidate ? { resourceValidate } : {}),
    });

    const hasErrors = Object.keys(parsed.errors).length > 0 || parsed.form.length > 0;
    if (hasErrors) {
        throw ValidationError.fromFieldErrors(parsed.errors, parsed.form);
    }

    const pruned = await pruneDanglingRelations(definitions, parsed.values as JsonObject);
    return pruned.values;
}

/**
 * Values with the locale group's shared fields taken from an existing sibling.
 * A field marked `translatable: false` belongs to the group, so a new
 * translation takes the sibling's value over whatever the caller sent.
 */
async function inheritSharedFields(
    values: Record<string, unknown>,
    definitions: { name: string }[],
    context: FieldContext
): Promise<Record<string, unknown>> {
    const { storage, type, localeGroup } = context;
    if (localeGroup === undefined || !storage.translatable) return values;

    const shared = getNonTranslatableFieldNames(
        type,
        definitions.map((field) => field.name)
    );
    if (shared.length === 0) return values;

    const [sibling] = await storage.translatable.siblings(localeGroup);
    if (!sibling) return values;

    const inherited: Record<string, unknown> = {};
    for (const name of shared) {
        if (sibling.fields[name] !== undefined) inherited[name] = sibling.fields[name];
    }
    return { ...values, ...inherited };
}

/**
 * Write the row and its relationship index rows, in one transaction when the
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
