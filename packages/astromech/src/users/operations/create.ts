import type { JsonObject, User, UserCreateData } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/validation';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { getCurrentUser } from '@/request-context/request-context';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';
import { createUserSchema } from '../schema';
import { queryUsers } from './query';

/** Create a CMS user, running its custom fields through the field pipeline. */
export async function createUser(params: { data: UserCreateData }): Promise<User> {
    const validated = parseInput(createUserSchema, params.data);

    const config = getConfig();
    const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
    const validate = config.users?.validate;
    const parsedFields = await parseFields(
        (validated.fields ?? {}) as Record<string, unknown>,
        fieldDefs,
        {
            operation: 'create',
            resource: { kind: 'user', record: null },
            user: await getCurrentUser(),
            lookups: fieldLookupsFromRecords({
                load: async () => (await queryUsers({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                entryTypes: (relIds) => existingEntryTypes(relIds),
            }),
            ...(validate ? { validate } : {}),
        }
    );
    // After `parseFields` (its minted item ids are what the traversal
    // needs) and before the write, so the index derives from pruned values.
    const { values: fields } = await pruneDanglingRelations(
        fieldDefs,
        parsedFields as JsonObject
    );

    const created = await createUserRepository().create({
        email: validated.email,
        name: validated.name,
        ...(Object.keys(fields).length > 0 && { fields }),
        roleSlug: validated.roleSlug,
    });
    await indexUserRelationships(created.id, fields);
    return toUser(created);
}
