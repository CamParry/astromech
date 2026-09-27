import type { UserResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { hashPassword } from 'better-auth/crypto';
import { defaultContentLocale } from '@/config/content-locale';
import { prepareFields } from '@/content/prepare-fields';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncUserRelationships } from '../relationships';
import { userRepository } from '../repository';
import { createUserSchema, userSchema } from '../schema';

/**
 * Create a CMS user, running its custom fields through the field pipeline. A
 * `password` also writes the credential account it signs in with.
 */
export const createUser = defineServiceMethod({
    summary: 'Create a new CMS user.',
    input: z.strictObject({ data: createUserSchema }),
    output: userSchema,
    access: 'users:create',
    mutates: true,
    async handler(params, ctx): Promise<UserResource> {
        const { data } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const fields = await prepareFields({
            resource: 'user',
            config,
            operation: 'create',
            user,
            scan: () => userRepository.findByLocale(defaultContentLocale(config)),
            values: data.fields ?? {},
        });

        // Hashed before the transaction opens, so no lock is held while it runs.
        const passwordHash =
            data.password === undefined ? undefined : await hashPassword(data.password);

        // The `users` row, its credential, its content row and the index write
        // are one transaction: an index that outlived a failed create would name
        // a user that is not there.
        return transaction(async () => {
            const row = await userRepository.create(
                {
                    email: data.email,
                    name: data.name,
                    role: data.role,
                },
                { fields, createdBy: userId, updatedBy: userId }
            );
            if (passwordHash !== undefined) {
                await userRepository.createCredentialAccount(row.id, passwordHash);
            }
            await syncUserRelationships(config, row.id);
            return row;
        });
    },
});
