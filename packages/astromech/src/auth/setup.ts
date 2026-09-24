/**
 * First-run setup: the write behind `POST /setup`, which creates the first
 * admin. One conditional insert is the gate, so concurrent calls on an empty
 * install create exactly one user without a lock or a transaction.
 */

import type { BuiltInRoleSlug } from '@/permissions/roles';
import { z } from '@hono/zod-openapi';
import { getDefaultContentLocale } from '@/config/content-locale';
import { transaction } from '@/database/transaction';
import { hashCredential } from '@/users/internal/credential-account';
import { getUserRepository } from '@/users/repository';

/** The refusal every closed sign-up path answers with. */
export const SIGN_UP_CLOSED = {
    code: 'SIGN_UP_CLOSED',
    message: 'Sign-up is closed. Ask an administrator to create your account.',
} as const;

/** The body `POST /setup` takes. Eight characters is Better Auth's own floor. */
export const firstAdminSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Create the first admin, with its credential account and its default-locale
 * content row. Answers `'closed'` when a user already exists, having written
 * nothing.
 */
export async function createFirstAdmin(
    input: z.infer<typeof firstAdminSchema>
): Promise<'created' | 'closed'> {
    const id = crypto.randomUUID();
    // Hashed before the transaction opens, so no lock is held while it runs.
    const passwordHash = await hashCredential(input.password);

    // libSQL runs the three writes as one transaction. D1 has no interactive
    // transactions, so there the first statement is the gate on its own: a
    // failure after it leaves an admin with no password, and
    // `astromech users:create` is how that install recovers.
    const repository = getUserRepository();
    return transaction(async () => {
        const inserted = await repository.createIfEmpty({
            id,
            email: input.email,
            name: input.name,
            emailVerified: true,
            role: 'admin' satisfies BuiltInRoleSlug,
        });
        if (!inserted) return 'closed';

        await repository.createCredentialAccount(id, passwordHash);
        // A write to a locale with no content row creates it.
        await repository.update(
            { id, locale: getDefaultContentLocale() },
            { fields: {} }
        );
        return 'created';
    });
}
