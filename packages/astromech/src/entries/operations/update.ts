import { getCurrentUser } from '@/context/index.js';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime.js';
import { updateEntrySchemaFor } from '../schema.js';
import { getEntryStorage } from '../storage/registry.js';
import { validate } from '../internal/validation.js';
import {
    getTitleField,
    isVersioningEnabled,
    getNonTranslatableFieldNames,
} from '../internal/type-config.js';
import {
    saveRelationships,
    buildRelationsSnapshot,
    buildIncomingRelations,
} from '../internal/relationships.js';
import { asEntry, loadAndAssertType } from '../internal/records.js';
import { deepEqual } from '../internal/diff.js';
import { runBulk } from '../internal/bulk.js';
import { entryHooksActive, entrySnapshot } from '../internal/hooks.js';
import { isPublicBranded, PublicShapeWriteError } from '../visibility.js';
import { createEntryScopedReads } from '../reads.js';
import { resolveEntryType } from '../type-registry.js';
import { entryValidationStage } from '../validation-stage.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { processFields } from '@/fields/pipeline.js';
import { ValidationError } from '@/errors/index.js';
import config from 'virtual:astromech/config';
import type { EntryStorage, StorageDb } from '../storage/types.js';
import type { Entry, EntryUpdateData, JsonObject } from '@/types/index.js';

/** Update a single entry (policy; persistence via storage). */
export async function updateOne(
    storage: EntryStorage,
    db: StorageDb | undefined,
    type: string,
    id: string,
    data: EntryUpdateData
): Promise<Entry> {
    const validatedData = validate(updateEntrySchemaFor(getTitleField(type)), data);
    const currentEntry = await loadAndAssertType(storage, type, id);

    if (validatedData.fields !== undefined) {
        const entryTypeConfig = resolveEntryType(config, type);
        const fieldDefs = entryTypeConfig
            ? flattenEntryFields(entryTypeConfig.fields)
            : [];

        // A canonical and its staged copy are one logical entry as far as
        // uniqueness is concerned, so each has to be invisible to the other's
        // scan. Only worth a lookup when the type can actually stage and some
        // field is actually unique — every other update would pay a round trip
        // for nothing. (Built-in storage already keeps staged rows out of
        // `list`, so today only the staged-row side changes any outcome; the
        // canonical side holds the invariant for a storage that doesn't.)
        const excludeIds = [id];
        const canStage = entryTypeConfig?.capabilities.staging === true;
        const hasUniqueField = fieldDefs.some((field) =>
            field.validation?.some((rule) => 'unique' in rule)
        );
        if (canStage && hasUniqueField) {
            const paired =
                currentEntry.stagedFor ?? (await storage.staging?.getByCanonical(id))?.id;
            if (paired) excludeIds.push(paired);
        }

        const processed = await processFields(
            validatedData.fields as Record<string, unknown>,
            fieldDefs,
            {
                operation: 'update',
                // An update that omits `status` keeps the row's current one, so
                // editing an already-published entry still enforces completeness.
                stage: entryValidationStage({
                    status: validatedData.status ?? currentEntry.status,
                    hasStatuses: entryTypeConfig
                        ? entryTypeConfig.capabilities.statuses !== false
                        : true,
                }),
                host: { kind: 'entry', record: currentEntry },
                user: getCurrentUser(),
                reads: createEntryScopedReads(storage, {
                    type,
                    locale: currentEntry.locale,
                    excludeId: excludeIds,
                }),
            }
        );
        if (Object.keys(processed.errors).length > 0) {
            throw ValidationError.fromFieldErrors(processed.errors);
        }
        validatedData.fields = processed.values as JsonObject;
    }

    if (isVersioningEnabled(type) && storage.versions) {
        const currentRelations = await buildRelationsSnapshot(id, db);
        const incomingRelations = validatedData.fields
            ? buildIncomingRelations(type, validatedData.fields as JsonObject)
            : currentRelations;

        const titleChanged =
            validatedData.title !== undefined &&
            validatedData.title !== currentEntry.title;
        const slugChanged =
            validatedData.slug !== undefined && validatedData.slug !== currentEntry.slug;
        const fieldsChanged =
            validatedData.fields !== undefined &&
            !deepEqual(currentEntry.fields, validatedData.fields);
        const relationsChanged =
            validatedData.fields !== undefined &&
            !deepEqual(currentRelations, incomingRelations);

        if (titleChanged || slugChanged || fieldsChanged || relationsChanged) {
            const latestNumber = await storage.versions.latestNumber(id);
            await storage.versions.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: currentEntry.title,
                slug: currentEntry.slug,
                fields: currentEntry.fields,
                relations: currentRelations,
                createdBy: null,
            });
        }
    }

    let publishedAt = validatedData.publishAt;
    if (validatedData.status === 'published' && !currentEntry.publishedAt) {
        publishedAt = new Date();
    }

    let slug = validatedData.slug;
    if (slug && slug !== currentEntry.slug) {
        slug = await storage.uniqueSlug(type, currentEntry.locale, slug, id);
    }

    const updated = await storage.update(id, {
        title: validatedData.title,
        slug,
        fields: validatedData.fields as JsonObject | undefined,
        status: validatedData.status,
        publishedAt,
    });

    if (validatedData.fields) {
        await saveRelationships(updated.id, validatedData.fields as JsonObject, type, db);
    }

    if (validatedData.fields && storage.translatable) {
        const changedFieldNames = Object.keys(validatedData.fields);
        const nonTranslatableNames = getNonTranslatableFieldNames(
            type,
            changedFieldNames
        );
        if (nonTranslatableNames.length > 0) {
            const nonTranslatableValues: JsonObject = {};
            const fields = validatedData.fields as JsonObject;
            for (const name of nonTranslatableNames) {
                const value = fields[name];
                if (value !== undefined) nonTranslatableValues[name] = value;
            }
            await storage.translatable.propagateFields(
                currentEntry.localeGroup,
                id,
                nonTranslatableValues
            );
        }
    }

    return asEntry(updated);
}

export async function update(params: {
    type: string;
    id: string | readonly string[];
    data: EntryUpdateData;
}): Promise<Entry | Entry[]> {
    // Write-back guard: reject public-branded fields (defense-in-depth).
    if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
        throw new PublicShapeWriteError();
    }
    const user = getCurrentUser();
    const hooksActive = entryHooksActive('entry:beforeUpdate', 'entry:afterUpdate');
    const storage = getEntryStorage(params.type);

    if (Array.isArray(params.id)) {
        if (params.data.slug !== undefined) {
            throw new Error(
                'Bulk update cannot set `slug`: a single value across multiple ids ' +
                    'would violate (type, locale) slug uniqueness. Update slugs individually.'
            );
        }
        const before = hooksActive
            ? await Promise.all(params.id.map((id) => entrySnapshot(params.type, id)))
            : [];
        for (const entry of before) {
            await runBeforeHooks(
                'entry:beforeUpdate',
                { type: params.type, entry, data: params.data, user },
                user
            );
        }
        const results = await runBulk(params.type, params.id, (txStorage, txDb, id) =>
            updateOne(txStorage, txDb, params.type, id, params.data)
        );
        for (const entry of before) {
            await runAfterHooks(
                'entry:afterUpdate',
                { type: params.type, entry, data: params.data, user },
                user
            );
        }
        return results;
    }

    const id = params.id as string;
    const before = hooksActive ? await entrySnapshot(params.type, id) : null;
    if (before) {
        await runBeforeHooks(
            'entry:beforeUpdate',
            { type: params.type, entry: before, data: params.data, user },
            user
        );
    }
    const updated = await updateOne(storage, undefined, params.type, id, params.data);
    if (before) {
        await runAfterHooks(
            'entry:afterUpdate',
            { type: params.type, entry: before, data: params.data, user },
            user
        );
    }
    return updated;
}
