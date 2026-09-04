import type { JsonObject, User } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { AstromechError } from '@/errors/astromech-error';
import { parseInput } from '@/errors/validation';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { requireRole } from '@/permissions/roles';
import { getCurrentUser } from '@/request-context/request-context';
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
        role: string;
    }>;
}): Promise<User> {
    const { id } = params;
    const validatedData = parseInput(updateUserSchema, params.data);

    if (validatedData.role !== undefined) {
        requireRole(getConfig(), validatedData.role);
    }

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
            current?.fields as Record<string, unknown> | undefined,
            patch
        );
        const parsed = await parseFields(merged, fieldDefs, {
            operation: 'update',
            resource: { kind: 'user', record: current },
            user: await getCurrentUser(),
            lookups: fieldLookupsFromRecords({
                load: async () => (await queryUsers({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => r.fields as Record<string, unknown>,
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

    const repository = createUserRepository();
    const { name, email, role } = validatedData;

    // The account columns and the content row are two writes, each made only
    // when the patch names that part.
    if (name !== undefined || email !== undefined || role !== undefined) {
        await repository.updateAccount(id, { name, email, role });
    }
    if (validatedData.fields !== undefined) {
        const userId = (await getCurrentUser())?.id ?? null;
        await repository.update(
            { id },
            { fields: validatedData.fields as JsonObject, updatedBy: userId }
        );
    }

    // An update that never touched `fields` must leave the index alone.
    if (validatedData.fields !== undefined) {
        await indexUserRelationships(id, validatedData.fields as JsonObject);
    }

    const updated = await repository.get(id);
    if (!updated) throw new AstromechError(`User '${id}' not found`);
    return toUser(updated);
}
