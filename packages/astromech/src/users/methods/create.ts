import type { UserResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { createUserRows } from '../create-user-rows';
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

        return createUserRows({
            config,
            user,
            row: { email: data.email, name: data.name, role: data.role },
            password: data.password,
            fields: data.fields,
        });
    },
});
