/**
 * The password behind a credential account: hashed the way better-auth checks
 * it. The user repository writes the `accounts` row.
 */

import { hashPassword } from 'better-auth/crypto';

/**
 * Hash `password` the way better-auth checks it. Separate from the write so a
 * caller can hash before opening a transaction and hold no lock while it runs.
 */
export function hashCredential(password: string): Promise<string> {
    return hashPassword(password);
}
