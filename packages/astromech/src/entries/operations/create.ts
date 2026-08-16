import { getCurrentUser } from '@/request-context/index';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime';
import { slugify } from '@/utilities/strings';
import { createEntrySchemaFor } from '../schema';
import { getEntryStorage } from '../storage/registry';
import { validate } from '../internal/validate';
import {
    getDefaultLocale,
    getNonTranslatableFieldNames,
    getTitleField,
} from '../internal/type-config';
import { indexEntryRelationships } from '../internal/relationships';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry } from '../internal/records';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';
import { UnknownEntryTypeError } from '../errors';
import { createEntryFieldReads } from '../reads';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { entryValidationStage } from '../validation-stage.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { processFields } from '@/fields/pipeline';
import { ValidationError } from '@/errors/index';
import { getConfig } from '@/config/registry';
import type { EntryStorage, StorageDb } from '../storage/types';
import type { Entry, EntryStatus, JsonObject } from '@/types/index';

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
    // Reject public-branded fields
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }

    // Validate type or throw
    const { type } = params;
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) throw new UnknownEntryTypeError(type);

    // Validate data
    const titleField = getTitleField(type);
    const validated = validate(createEntrySchemaFor(titleField), {
        title: params.title,
        slug: params.slug,
        fields: params.fields,
        status: params.status,
        publishAt: params.publishAt,
    });

    const storage = getEntryStorage(type);

    // Set defaults
    const title = validated.title ?? '';
    const status = validated.status || 'unpublished';
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishAt ?? null);
    const locale = params.locale ?? getDefaultLocale();

    const user = getCurrentUser();
    const fieldDefs = flattenEntryFields(entryType.fields);

    // Non-translatable fields belong to the locale group, not to this row, so a
    // new translation inherits them from an existing sibling rather than taking
    // whatever the form sent. Runs before validation so an inherited value is
    // validated like any other.
    let incomingFields = (validated.fields ?? {}) as Record<string, unknown>;
    if (params.localeGroup !== undefined && storage.translatable) {
        const shared = getNonTranslatableFieldNames(
            type,
            fieldDefs.map((field) => field.name)
        );
        if (shared.length > 0) {
            const [sibling] = await storage.translatable.siblings(params.localeGroup);
            if (sibling) {
                const siblingFields: Record<string, unknown> = sibling.fields;
                const inherited: Record<string, unknown> = {};
                for (const name of shared) {
                    if (siblingFields[name] !== undefined) {
                        inherited[name] = siblingFields[name];
                    }
                }
                incomingFields = { ...incomingFields, ...inherited };
            }
        }
    }

    const resourceValidate = entryType.validate;

    const processed = await processFields(incomingFields, fieldDefs, {
        operation: 'create',
        stage: entryValidationStage({
            status,
            hasStatuses: entryType.capabilities.statuses !== false,
        }),
        host: { kind: 'entry', record: null },
        user,
        reads: createEntryFieldReads(storage, { type, locale }),
        ...(resourceValidate ? { resourceValidate } : {}),
    });
    if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
        throw ValidationError.fromFieldErrors(processed.errors, processed.form);
    }
    // After `processFields` (its minted item ids are what the traversal needs)
    // and before the row is written, so the index derives from the pruned values.
    const pruned = await pruneDanglingRelations(
        fieldDefs,
        processed.values as JsonObject
    );
    const processedFields = pruned.values;

    // Set slug
    const slug =
        validated.slug || titleField
            ? await storage.uniqueSlug(type, locale, validated.slug ?? slugify(title))
            : null;

    const data = {
        title,
        slug,
        locale,
        localeGroup: params.localeGroup,
        fields: processedFields,
        status,
        publishedAt,
    };

    // Run before create hook
    await runBeforeHooks('entry:beforeCreate', { type, data, user }, user);

    // Save row and it's derived relationships
    const persist = async (
        txStorage: EntryStorage,
        txDb: StorageDb | undefined
    ): Promise<Entry> => {
        const entry = asEntry(await txStorage.create({ type, ...data }));
        await indexEntryRelationships(entry, data.fields, type, txDb);
        return entry;
    };

    // Create entry
    const entry = storage.transaction
        ? await storage.transaction(persist)
        : await persist(storage, undefined);

    // Run after create hook
    await runAfterHooks('entry:afterCreate', { type, data, user, entry }, user);

    return entry;
}
