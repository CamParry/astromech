import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { ValidationError } from '@/errors/validation';
import { fieldReadsFromRecords } from '@/fields/field-reads';
import { flattenFieldNodes } from '@/fields/flatten';
import { processFields } from '@/fields/pipeline';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import type { JsonObject, Media } from '@/types/index';
import config from 'virtual:astromech/config';
import { updateMediaSchema } from '../schema';
import { createMediaStorage } from '../storage';
import { parseWith } from '../internal/parse';
import { indexMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
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
    const validatedData = parseWith(updateMediaSchema, params.data);

    if (validatedData.fields !== undefined) {
        const current = await get({ id });
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
        const processed = await processFields(merged, fieldDefs, {
            operation: 'update',
            host: { kind: 'media', record: current },
            user: getCurrentUser(),
            reads: fieldReadsFromRecords({
                load: async () => (await query({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                excludeId: id,
            }),
            coerceOnly: new Set(patchedNames),
            ...(resourceValidate ? { resourceValidate } : {}),
        });
        if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
            throw ValidationError.fromFieldErrors(processed.errors, processed.form);
        }
        // After `processFields` (its minted item ids are what the traversal
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
