import { getCurrentUser } from '@/request-context/index';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime';
import { updateEntrySchema } from '../schema';
import { getEntryStorage } from '../storage/registry';
import { validate } from '../internal/validate';
import {
    isTitled,
    isVersioningEnabled,
    getNonTranslatableFieldNames,
} from '../internal/type-config';
import { indexEntryRelationships } from '../internal/relationships';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry, loadAndAssertType } from '../internal/records';
import { deepEqual } from '../internal/deep-equal';
import { runBulk } from '../internal/bulk';
import { hasEntryHooks, loadEntrySnapshot } from '../internal/hooks';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';
import { createEntryLookups } from '../lookups';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { entryValidationMode } from '../validation-mode.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/pipeline';
import { mergePatch, projectToSchema } from '@/fields/values';
import { ValidationError } from '@/errors/index';
import { getConfig } from '@/config/registry';
import type { EntryStorage, StorageDb } from '../storage/types';
import type { Entry, EntryUpdateData, JsonObject } from '@/types/index';

/** Update a single entry (policy; persistence via storage). */
export async function updateOne(
    storage: EntryStorage,
    db: StorageDb | undefined,
    type: string,
    id: string,
    data: EntryUpdateData
): Promise<Entry> {
    const validatedData = validate(updateEntrySchema({ titled: isTitled(type) }), data);
    const currentEntry = await loadAndAssertType(storage, type, id);

    // Root field names the caller actually sent — needed after the block too,
    // for the translatable propagation.
    let patchedFieldNames: string[] = [];

    if (validatedData.fields !== undefined) {
        const entryType = resolveEntryType(getConfig(), type);
        const fieldDefs = entryType ? flattenEntryFields(entryType.fields) : [];

        // A canonical and its staged copy are one logical entry as far as
        // uniqueness is concerned, so each has to be invisible to the other's
        // scan. Only worth a lookup when the type can actually stage and some
        // field is actually unique — every other update would pay a round trip
        // for nothing. (Built-in storage already keeps staged rows out of
        // `list`, so today only the staged-row side changes any outcome; the
        // canonical side holds the invariant for a storage that doesn't.)
        const excludeIds = [id];
        const canStage = entryType?.capabilities.staging === true;
        const hasUniqueField = fieldDefs.some((field) =>
            field.validation?.some((rule) => 'unique' in rule)
        );
        if (canStage && hasUniqueField) {
            const paired =
                currentEntry.stagedFor ?? (await storage.staging?.getByCanonical(id))?.id;
            if (paired) excludeIds.push(paired);
        }

        const resourceValidate = entryType?.validate;

        // `fields` is a patch, not a replacement: an omitted field keeps its
        // stored value, an explicit `null` stores null, and an array or
        // container value replaces wholesale. Only the patched fields are
        // coerced, but validation sees the merged document.
        const patch = validatedData.fields as Record<string, unknown>;
        patchedFieldNames = Object.keys(patch).filter((k) => patch[k] !== undefined);
        const merged = mergePatch(
            currentEntry.fields as Record<string, unknown> | null,
            patch
        );

        const processed = await parseFields(merged, fieldDefs, {
            operation: 'update',
            // An update that omits `status` keeps the row's current one, so
            // editing an already-published entry still enforces completeness.
            validation: entryValidationMode({
                status: validatedData.status ?? currentEntry.status,
                hasStatuses: entryType ? entryType.capabilities.statuses !== false : true,
            }),
            resource: { kind: 'entry', record: currentEntry },
            user: getCurrentUser(),
            lookups: createEntryLookups(storage, {
                type,
                locale: currentEntry.locale,
                excludeId: excludeIds,
            }),
            coerceOnly: new Set(patchedFieldNames),
            ...(resourceValidate ? { resourceValidate } : {}),
        });
        if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
            throw ValidationError.fromFieldErrors(processed.errors, processed.form);
        }
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from pruned values.
        const pruned = await pruneDanglingRelations(
            fieldDefs,
            projectToSchema(processed.values, fieldDefs) as JsonObject,
            db
        );
        validatedData.fields = pruned.values;
    }

    if (isVersioningEnabled(type) && storage.versions) {
        const titleChanged =
            validatedData.title !== undefined &&
            validatedData.title !== currentEntry.title;
        const slugChanged =
            validatedData.slug !== undefined && validatedData.slug !== currentEntry.slug;
        const fieldsChanged =
            validatedData.fields !== undefined &&
            !deepEqual(currentEntry.fields, validatedData.fields);

        if (titleChanged || slugChanged || fieldsChanged) {
            const latestNumber = await storage.versions.latestNumber(id);
            await storage.versions.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: currentEntry.title,
                slug: currentEntry.slug,
                fields: currentEntry.fields,
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
        await indexEntryRelationships(
            updated,
            validatedData.fields as JsonObject,
            type,
            db
        );
    }

    if (validatedData.fields && storage.translatable) {
        // Only what the caller sent: the merged resource holds every field, and
        // propagating an untouched one would overwrite its sibling locales.
        const nonTranslatableNames = getNonTranslatableFieldNames(
            type,
            patchedFieldNames
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
    const hooksActive = hasEntryHooks('entry:beforeUpdate', 'entry:afterUpdate');
    const storage = getEntryStorage(params.type);

    if (Array.isArray(params.id)) {
        if (params.data.slug !== undefined) {
            throw new Error(
                'Bulk update cannot set `slug`: a single value across multiple ids ' +
                    'would violate (type, locale) slug uniqueness. Update slugs individually.'
            );
        }
        const before = hooksActive
            ? await Promise.all(params.id.map((id) => loadEntrySnapshot(params.type, id)))
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
    const before = hooksActive ? await loadEntrySnapshot(params.type, id) : null;
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
