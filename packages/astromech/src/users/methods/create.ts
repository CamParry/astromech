import type { UserResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { userPermission } from '@/users/permissions';
import { createUserRows } from '../create-user-rows';
import { asEmailTakenError, assertEmailFree } from '../internal/unique-email';
import { createUserSchema, userSchema } from '../schema';

/**
 * A `password` also writes the credential account the user signs in with.
 * Without one, the user sets a password through the reset link. An email
 * another user holds answers 422.
 */
export const createUser = defineServiceMethod({
    summary: 'Create a new CMS user.',
    input: z.strictObject({ data: createUserSchema }),
    output: userSchema,
    access: userPermission('create'),
    mutates: true,
    async handler(params, ctx): Promise<UserResource> {
        const { data } = params;
        const { config, user } = ctx;

        await assertEmailFree(data.email);
        try {
            return await createUserRows({
                config,
                user,
                row: { email: data.email, name: data.name, role: data.role },
                password: data.password,
                fields: data.fields,
            });
        } catch (err) {
            throw asEmailTakenError(err);
        }
    },
});
