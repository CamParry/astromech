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
import type { EntryStorage, StorageDb } from '../storage/types';
import type { ResolvedEntryType, User } from '@/types/index';
import type { Entry, EntryStatus, JsonObject } from '@/types/index';

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

export async function create(params: {
    type: string;
    title?: string;
    slug?: string;
    locale?: string;
    localeGroup?: string;
    fields?: JsonObject;
    status?: EntryStatus;
    publishAt?: Date | null;
}): Promise<Entry> {
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }

    const type = params.type;
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) throw new UnknownEntryTypeError(type);

    const titled = isTitled(type);
    const validated = validate(createEntrySchema({ titled }), {
        title: params.title,
        slug: params.slug,
        fields: params.fields,
        status: params.status,
        publishAt: params.publishAt,
    });

    const storage = getEntryStorage(type);
    const user = getCurrentUser();
    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishAt ?? null);
    const locale = params.locale ?? getDefaultLocale();

    // A slug needs both permission and a source. A titleless type has no title
    // to derive one from, so it stays null rather than slugifying `''` into a
    // run of `-2`, `-3` collisions.
    const slugSource = entryType.capabilities.slug
        ? (validated.slug ?? (titled ? slugify(title) : null))
        : null;
    const slug = slugSource ? await storage.uniqueSlug(type, locale, slugSource) : null;

    const context: FieldContext = {
        entryType,
        storage,
        type,
        locale,
        localeGroup: params.localeGroup,
        status,
        user,
    };
    const fields = await resolveFields(validated.fields ?? {}, context);

    const data = {
        title,
        slug,
        locale,
        localeGroup: params.localeGroup,
        fields,
        status,
        publishedAt,
    };

    // `data` is the row itself, so a handler that assigns to it changes what is
    // written and what the relationship index derives from.
    await runBeforeHooks('entry:beforeCreate', { type, data, user }, user);

    // The row and its derived relationship rows go in together or not at all.
    // Storages that cannot open a transaction fall back to sequential writes.
    const persist = async (
        txStorage: EntryStorage,
        txDb: StorageDb | undefined
    ): Promise<Entry> => {
        const entry = asEntry(await txStorage.create({ type, ...data }));
        await indexEntryRelationships(entry, data.fields, type, txDb);
        return entry;
    };

    const entry = storage.transaction
        ? await storage.transaction(persist)
        : await persist(storage, undefined);

    await runAfterHooks('entry:afterCreate', { type, data, user, entry }, user);

    return entry;
}

/**
 * Field values as they will be stored: the locale group's shared values
 * inherited, every value coerced and validated, dead relation ids dropped.
 * Throws a 422 if a field or the type's own validator reports.
 */
async function resolveFields(
    values: Record<string, unknown>,
    context: FieldContext
): Promise<JsonObject> {
    const { entryType, storage, type, locale, status, user } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const inherited = await inheritSharedFields(values, definitions, context);

    const resourceValidate = entryType.validate;
    const parsed = await parseFields(inherited, definitions, {
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
