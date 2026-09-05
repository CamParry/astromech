import type { JsonObject, User, UserCreateData } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/validation';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { requireRole } from '@/permissions/roles';
import { defineServiceMethod } from '@/services/define-service-method';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';
import { createUserSchema } from '../schema';

/**
 * The `data` slot, declared as what it describes rather than inferred.
 * `createUserSchema`'s optional keys widen to `| undefined`, which
 * `exactOptionalPropertyTypes` keeps distinct from `UserCreateData`'s
 * `fields?: JsonObject`. `ParsedInput` reconciles that at the top level of an
 * argument object; it does not reach inside one, and the same schema object is
 * what parses the call.
 */
const createData = createUserSchema as unknown as z.ZodType<UserCreateData>;

/** Create a CMS user, running its custom fields through the field pipeline. */
export const createUser = defineServiceMethod({
    summary: 'Create a new CMS user.',
    input: z.object({ data: createData }),
    access: 'users:create',
    mutates: true,
    async handler(params: { data: UserCreateData }, ctx): Promise<User> {
        const validated = parseInput(createUserSchema, params.data);

        const config = ctx.config;
        requireRole(config, validated.role);

        const fieldDefs = flattenFieldNodes(config.users.fields);
        const validate = config.users.validate;
        const parsedFields = await parseFields(
            (validated.fields ?? {}) as Record<string, unknown>,
            fieldDefs,
            {
                operation: 'create',
                resource: { kind: 'user', record: null },
                user: ctx.user,
                lookups: fieldLookupsFromRecords({
                    load: async () => (await ctx.users.query({ limit: 'all' })).data,
                    getId: (r) => r.id,
                    getFields: (r) => r.fields as Record<string, unknown>,
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

        // The account row, its content row and the index write are one
        // transaction: an index that outlived a failed create would name a user
        // that is not there.
        const userId = ctx.user?.id ?? null;
        const created = await transaction(async () => {
            const row = await createUserRepository().create(
                {
                    email: validated.email,
                    name: validated.name,
                    role: validated.role,
                },
                { fields, createdBy: userId, updatedBy: userId }
            );
            await indexUserRelationships(row.id);
            return row;
        });
        return toUser(created);
    },
});
