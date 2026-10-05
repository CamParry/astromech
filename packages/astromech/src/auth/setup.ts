/**
 * First-run setup: the write behind `POST /setup`, which creates the first
 * admin. One conditional insert is the gate, so concurrent calls on an empty
 * install create exactly one user without a lock or a transaction.
 */

import type { BuiltInRoleSlug } from '@/permissions/roles';
import { z } from '@hono/zod-openapi';
import { getConfig } from '@/config/registry';
import { jsonObject } from '@/services/json';
import { createUserRows } from '@/users/create-user-rows';
import { userRepository } from '@/users/repository';

/** The refusal every closed sign-up path answers with. */
export const SIGN_UP_CLOSED = {
    code: 'SIGN_UP_CLOSED',
    message: 'Sign-up is closed. Ask an administrator to create your account.',
} as const;

/** The refusal a sign-in gets while its account is locked, with `Retry-After`. */
export const ACCOUNT_LOCKED = {
    code: 'ACCOUNT_LOCKED',
    message:
        'Too many failed sign-ins for this account. Try again later, or reset your password.',
} as const;

/** The body `POST /setup` takes. Eight characters is Better Auth's own floor. */
export const firstAdminSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    data: z.strictObject({ fields: jsonObject.optional() }).optional(),
});

/**
 * Whether first-run setup is open: no `users` row exists, with or without a
 * content row. `GET /setup/check` answers it; `createFirstAdmin` checks it first.
 */
export async function needsSetup(): Promise<boolean> {
    return (await userRepository.countUserRows()) === 0;
}

/**
 * Create the first admin as `users.create` creates a user, its fields parsed as
 * a create. Answers `'closed'` when a user already exists, having written
 * nothing and checked no field.
 */
export async function createFirstAdmin(
    input: z.infer<typeof firstAdminSchema>
): Promise<'created' | 'closed'> {
    if (!(await needsSetup())) return 'closed';

    // The empty-table insert is the gate against a concurrent setup. D1 has no
    // interactive transactions, so there a failure after it leaves an admin with
    // no password, and `astromech users:create` is how that install recovers.
    const created = await createUserRows({
        config: getConfig(),
        user: null,
        row: {
            email: input.email,
            name: input.name,
            emailVerified: true,
            role: 'admin' satisfies BuiltInRoleSlug,
        },
        password: input.password,
        fields: input.data?.fields,
        ifEmpty: true,
    });
    return created === null ? 'closed' : 'created';
}
