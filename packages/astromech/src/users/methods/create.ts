import type { JsonObject, User } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { requireRole } from '@/permissions/roles';
import { defineServiceMethod } from '@/services/define-service-method';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';
import { createUserSchema } from '../schema';

/** Create a CMS user, running its custom fields through the field pipeline. */
export const createUser = defineServiceMethod({
    summary: 'Create a new CMS user.',
    input: z.object({ data: createUserSchema }),
    access: 'users:create',
    mutates: true,
    async handler(params, ctx): Promise<User> {
        const { data } = params;

        const config = ctx.config;
        requireRole(config, data.role);

        const fieldDefs = flattenFieldNodes(config.users.fields);
        const validate = config.users.validate;
        const parsedFields = await parseFields(data.fields ?? {}, fieldDefs, {
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
        });
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from pruned values.
        const { values: fields } = await pruneDanglingRelations(
            ctx.config,
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
                    email: data.email,
                    name: data.name,
                    role: data.role,
                },
                { fields, createdBy: userId, updatedBy: userId }
            );
            await indexUserRelationships(ctx.config, row.id);
            return row;
        });
        return toUser(created);
    },
});
