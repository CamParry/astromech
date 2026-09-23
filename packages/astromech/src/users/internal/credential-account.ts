/**
 * The credential account behind a password sign-in: the `accounts` row
 * better-auth reads, written the one way setup, the CLI and `users.create` share.
 */

import { hashPassword } from 'better-auth/crypto';
import { createRepository } from '@/database/repository/create-repository';
import { accountsTable } from '@/database/tables';

/**
 * Hash `password` the way better-auth checks it. Separate from the write so a
 * caller can hash before opening a transaction and hold no lock while it runs.
 */
export function hashCredential(password: string): Promise<string> {
    return hashPassword(password);
}

/** Write the credential account that lets `userId` sign in with `passwordHash`. */
export async function createCredentialAccount(
    userId: string,
    passwordHash: string
): Promise<void> {
    const now = new Date();
    await createRepository(accountsTable).create({
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
    });
}
