import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/storage/resource-existence';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { ValidationError } from '@/errors/validation';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/pipeline';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import type { JsonObject, User } from '@/types/index';
import { updateUserSchema } from '../schema';
import { createUserStorage } from '../storage';
import { validate } from '../internal/validate';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { get } from './get';
import { query } from './query';

/** Update a user's profile, role and custom fields. */
export async function update(params: {
    id: string;
    data: Partial<{
        name: string;
        email: string;
        fields: JsonObject;
        roleSlug: string;
    }>;
}): Promise<User> {
    const { id } = params;
    const validatedData = validate(updateUserSchema, params.data);

    if (validatedData.fields !== undefined) {
        const current = await get({ id });
        const config = getConfig();
        const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
        const resourceValidate = config.users?.validate;
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
            resource: { kind: 'user', record: current },
            user: getCurrentUser(),
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
        if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
            throw ValidationError.fromFieldErrors(processed.errors, processed.form);
        }
        // After `parseFields`, before the write — same ordering as create.
        const pruned = await pruneDanglingRelations(
            fieldDefs,
            projectToSchema(processed.values, fieldDefs) as JsonObject
        );
        validatedData.fields = pruned.values;
    }

    // An explicitly-`undefined` key means "leave this column alone"; storage
    // stamps `updatedAt`.
    const updated = await createUserStorage().update(id, {
        name: validatedData.name,
        email: validatedData.email,
        fields: validatedData.fields as JsonObject | undefined,
        roleSlug: validatedData.roleSlug,
    });
    // An update that never touched `fields` must leave the index alone.
    if (validatedData.fields !== undefined) {
        await indexUserRelationships(id, validatedData.fields as JsonObject);
    }
    return toUser(updated);
}
