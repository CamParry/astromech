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
 * A `password` also writes the credential account the user signs in with.
 * Without one, the user sets a password through the reset link.
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
        const locale = defaultContentLocale(config);

        const fields = await prepareFields({
            resource: 'user',
            config,
            operation: 'create',
            user,
            scan: () => userRepository.findByLocale(locale),
            values: data.fields ?? {},
        });
        // Hashed before the transaction, so no lock is held while it runs.
        const passwordHash =
            data.password === undefined ? undefined : await hashPassword(data.password);

        return transaction(async () => {
            const created = await userRepository.create(
                { email: data.email, name: data.name, role: data.role },
                { fields, createdBy: userId, updatedBy: userId }
            );
            if (passwordHash !== undefined) {
                await userRepository.createCredentialAccount(created.id, passwordHash);
            }
            await syncUserRelationships(config, created.id);
            return created;
        });
    },
});
