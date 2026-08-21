import type { JsonObject, User } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/index';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';
import { updateUserSchema } from '../schema';
import { getUser } from './get';
import { queryUsers } from './query';

/** Update a user's profile, role and custom fields. */
export async function updateUser(params: {
    id: string;
    data: Partial<{
        name: string;
        email: string;
        fields: JsonObject;
        roleSlug: string;
    }>;
}): Promise<User> {
    const { id } = params;
    const validatedData = parseInput(updateUserSchema, params.data);

    if (validatedData.fields !== undefined) {
        const current = await getUser({ id });
        const config = getConfig();
        const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
        const validate = config.users?.validate;
        // `fields` is a patch: an omitted field keeps its stored value, an
        // explicit `null` stores null, and a container replaces wholesale.
        const patch = validatedData.fields as Record<string, unknown>;
        const patchedNames = Object.keys(patch).filter((k) => patch[k] !== undefined);
        const merged = mergePatch(
            current?.fields as Record<string, unknown> | null | undefined,
            patch
        );
        const parsed = await parseFields(merged, fieldDefs, {
            operation: 'update',
            resource: { kind: 'user', record: current },
            user: await getCurrentUser(),
            lookups: fieldLookupsFromRecords({
                load: async () => (await queryUsers({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                excludeId: id,
                entryTypes: (relIds) => existingEntryTypes(relIds),
            }),
            coerceOnly: new Set(patchedNames),
            ...(validate ? { validate } : {}),
        });
        // After `parseFields`, before the write — same ordering as create.
        const pruned = await pruneDanglingRelations(
            fieldDefs,
            projectToSchema(parsed, fieldDefs) as JsonObject
        );
        validatedData.fields = pruned.values;
    }

    // An explicitly-`undefined` key means "leave this column alone"; storage
    // stamps `updatedAt`.
    const updated = await createUserRepository().update(id, {
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
