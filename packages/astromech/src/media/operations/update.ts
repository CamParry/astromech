import type { JsonObject, Media } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/validation';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/request-context';
import { indexMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';
import { updateMediaSchema } from '../schema';
import { getMedia } from './get';
import { queryMedia } from './query';

/** Update a media item's metadata and custom fields. */
export async function updateMedia(params: {
    id: string;
    data: Partial<{
        alt: string;
        title: string;
        caption: string;
        fields: JsonObject;
    }>;
}): Promise<Media> {
    const { id } = params;
    const validatedData = parseInput(updateMediaSchema, params.data);

    if (validatedData.fields !== undefined) {
        const current = await getMedia({ id });
        const config = getConfig();
        const fieldDefs = flattenFieldNodes(config.media?.fields ?? []);
        const validate = config.media?.validate;
        // `fields` is a patch: an omitted field keeps its stored value, an
        // explicit `null` stores null, and a container replaces wholesale.
        const patch = validatedData.fields as Record<string, unknown>;
        const patchedNames = Object.keys(patch).filter((k) => patch[k] !== undefined);
        const merged = mergePatch(current?.fields, patch);
        const parsed = await parseFields(merged, fieldDefs, {
            operation: 'update',
            resource: { kind: 'media', record: current },
            user: await getCurrentUser(),
            lookups: fieldLookupsFromRecords({
                load: async () => (await queryMedia({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => r.fields,
                excludeId: id,
                entryTypes: (relIds) => existingEntryTypes(relIds),
            }),
            coerceOnly: new Set(patchedNames),
            ...(validate ? { validate } : {}),
        });
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from the pruned
        // values.
        const pruned = await pruneDanglingRelations(
            fieldDefs,
            projectToSchema(parsed, fieldDefs) as JsonObject
        );
        validatedData.fields = pruned.values;
    }

    const user = await getCurrentUser();

    // The row write and its index write are one transaction: an index that
    // outlived a failed write would name relations the stored fields do not.
    const updated = await transaction(async () => {
        // `updatedAt` is stamped by the repository (the column declares
        // `onUpdate`); an explicitly-`undefined` key means "leave this column
        // alone".
        const row = await createMediaRepository().update(id, {
            alt: validatedData.alt,
            title: validatedData.title,
            caption: validatedData.caption,
            fields: validatedData.fields as JsonObject | undefined,
            updatedBy: user?.id ?? null,
        });
        // An update that never touched `fields` must leave the index alone.
        if (validatedData.fields !== undefined) {
            await indexMediaRelationships(id, validatedData.fields as JsonObject);
        }
        return row;
    });
    return toMedia(updated);
}
