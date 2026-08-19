import type { JsonObject, Media } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/storage/resource-existence';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import { indexMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
import { validate } from '../internal/validate';
import { updateMediaSchema } from '../schema';
import { createMediaStorage } from '../storage';
import { get } from './get';
import { query } from './query';

/** Update a media item's metadata and custom fields. */
export async function update(params: {
    id: string;
    data: Partial<{
        alt: string;
        title: string;
        caption: string;
        fields: JsonObject;
    }>;
}): Promise<Media> {
    const { id } = params;
    const validatedData = validate(updateMediaSchema, params.data);

    if (validatedData.fields !== undefined) {
        const current = await get({ id });
        const config = getConfig();
        const fieldDefs = flattenFieldNodes(config.media?.fields ?? []);
        const resourceValidate = config.media?.validate;
        // `fields` is a patch: an omitted field keeps its stored value, an
        // explicit `null` stores null, and a container replaces wholesale.
        const patch = validatedData.fields as Record<string, unknown>;
        const patchedNames = Object.keys(patch).filter((k) => patch[k] !== undefined);
        const merged = mergePatch(
            current?.fields as Record<string, unknown> | null | undefined,
            patch
        );
        const processed = await parseFields(merged, fieldDefs, {
            operation: 'update',
            resource: { kind: 'media', record: current },
            user: await getCurrentUser(),
            lookups: fieldLookupsFromRecords({
                load: async () => (await query({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                excludeId: id,
                entryTypes: (relIds) => existingEntryTypes(relIds),
            }),
            coerceOnly: new Set(patchedNames),
            ...(resourceValidate ? { resourceValidate } : {}),
        });
        assertNoFieldErrors(processed);
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from the pruned
        // values.
        const pruned = await pruneDanglingRelations(
            fieldDefs,
            projectToSchema(processed.values, fieldDefs) as JsonObject
        );
        validatedData.fields = pruned.values;
    }

    // `updatedAt` is stamped by the storage wrapper (the column declares
    // `onUpdate`); an explicitly-`undefined` key means "leave this column alone".
    const updated = await createMediaStorage().update(id, {
        alt: validatedData.alt,
        title: validatedData.title,
        caption: validatedData.caption,
        fields: validatedData.fields as JsonObject | undefined,
    });
    // An update that never touched `fields` must leave the index alone.
    if (validatedData.fields !== undefined) {
        await indexMediaRelationships(id, validatedData.fields as JsonObject);
    }
    return toMedia(updated);
}
