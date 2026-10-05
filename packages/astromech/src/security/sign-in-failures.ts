/**
 * Failed sign-ins counted per account, known or not, so a lock tells nobody
 * which emails have one. A lock doubles with each repeat, up to an hour.
 */

import { signInFailureRepository } from '@/security/repository/sign-in-failures';
import { sha256Hex } from '@/utilities/hash';

/** How many refusals lock an account, in what window, and for how long. */
export const ACCOUNT_LOCK = {
    failures: 5,
    windowMs: 15 * 60_000,
    firstLockMs: 5 * 60_000,
    maxLockMs: 60 * 60_000,
} as const;

/** When the account `email` is locked until, or null. Unknown emails lock too. */
export async function findAccountLock(email: string): Promise<Date | null> {
    const row = await signInFailureRepository.findByKey(await accountKey(email));
    if (row?.lockedUntil == null || row.lockedUntil <= Date.now()) return null;
    return new Date(row.lockedUntil);
}

/** Count one refused sign-in against `email`, and lock it when over the limit. */
export async function recordSignInFailure(input: {
    email: string;
    address: string | undefined;
}): Promise<void> {
    const key = await accountKey(input.email);
    const now = Date.now();
    const failure = await signInFailureRepository.recordFailure(
        key,
        now,
        ACCOUNT_LOCK.windowMs
    );
    if (failure.count < ACCOUNT_LOCK.failures) return;
    const lockMs = Math.min(
        ACCOUNT_LOCK.firstLockMs * 2 ** failure.lockCount,
        ACCOUNT_LOCK.maxLockMs
    );
    await signInFailureRepository.lock(key, ACCOUNT_LOCK.failures, now + lockMs);
}

/** Forget `email`'s failures and lock level: a successful sign-in or a completed reset. */
export async function clearSignInFailures(email: string): Promise<void> {
    await signInFailureRepository.deleteByKey(await accountKey(email));
}

/** Failures are keyed on a hash, since people type passwords into the email field. */
async function accountKey(email: string): Promise<string> {
    return `account:${await sha256Hex(email.trim().toLowerCase())}`;
}
