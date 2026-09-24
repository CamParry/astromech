import type { User } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { writeFields } from '@/content/write-fields';
import { transaction } from '@/database/transaction';
import { getRole } from '@/permissions/roles';
import { defineServiceMethod } from '@/services/define-service-method';
import { createCredentialAccount, hashCredential } from '../internal/credential-account';
import { syncUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';
import { createUserSchema } from '../schema';

/**
 * Create a CMS user, running its custom fields through the field pipeline. A
 * `password` also writes the credential account it signs in with.
 */
export const createUser = defineServiceMethod({
    summary: 'Create a new CMS user.',
    input: z.object({ data: createUserSchema }),
    access: 'users:create',
    mutates: true,
    async handler(params, ctx): Promise<User> {
        const { data } = params;

        const config = ctx.config;
        getRole(config, data.role);

        const repository = createUserRepository(config);
        const fields = await writeFields(
            RESOURCE_SPECS.user,
            config,
            { values: data.fields ?? {} },
            {
                operation: 'create',
                record: null,
                user: ctx.user,
                scan: () => repository.listContent(defaultContentLocale(config)),
            }
        );

        // Hashed before the transaction opens, so no lock is held while it runs.
        const passwordHash =
            data.password === undefined ? undefined : await hashCredential(data.password);

        // The account row, its credential, its content row and the index write
        // are one transaction: an index that outlived a failed create would name
        // a user that is not there.
        const userId = ctx.user?.id ?? null;
        const created = await transaction(async () => {
            const row = await repository.create(
                {
                    email: data.email,
                    name: data.name,
                    role: data.role,
                },
                { fields, createdBy: userId, updatedBy: userId }
            );
            if (passwordHash !== undefined) {
                await createCredentialAccount(row.id, passwordHash);
            }
            await syncUserRelationships(ctx.config, row.id);
            return row;
        });
        return toUser(created);
    },
});
