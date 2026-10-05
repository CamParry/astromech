/**
 * Failed sign-ins counted per account, known or not, so a lock tells nobody
 * which emails have one. A lock doubles with each repeat, up to an hour.
 */

import { clearAddressListCache, isAddressAllowed } from '@/security/address-lists';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import { signInFailureRepository } from '@/security/repository/sign-in-failures';
import { sha256Hex } from '@/utilities/hash';
import { rateLimitKey } from '@/utilities/ip-address';

/** How many refusals lock an account, in what window, and for how long. */
export const ACCOUNT_LOCK = {
    failures: 5,
    windowMs: 15 * 60_000,
    firstLockMs: 5 * 60_000,
    maxLockMs: 60 * 60_000,
} as const;

/** How many refusals from one address block it, in what window, and for how long. */
export const ADDRESS_BLOCK = {
    failures: 20,
    windowMs: 15 * 60_000,
    blockMs: 60 * 60_000,
} as const;

/** When the account `email` is locked until, or null. Unknown emails lock too. */
export async function findAccountLock(email: string): Promise<Date | null> {
    const row = await signInFailureRepository.findByKey(await accountKey(email));
    if (row?.lockedUntil == null || row.lockedUntil <= Date.now()) return null;
    return new Date(row.lockedUntil);
}

/**
 * Count one refused sign-in against `email`, and lock it when over the limit,
 * and against `address`, which is blocked when it fails across many accounts.
 */
export async function recordSignInFailure(input: {
    email: string;
    address: string | undefined;
}): Promise<void> {
    await recordAccountFailure(input.email);
    if (input.address !== undefined) await recordAddressFailure(input.address);
}

/**
 * Count one refused sign-in against `address`, and block it for an hour once it
 * has failed 20 times in 15 minutes. An allowed address is never blocked.
 */
export async function recordAddressFailure(address: string): Promise<void> {
    const key = `address:${rateLimitKey(address)}`;
    const now = Date.now();
    const failure = await signInFailureRepository.recordFailure(
        key,
        now,
        ADDRESS_BLOCK.windowMs
    );
    if (failure.count < ADDRESS_BLOCK.failures) return;
    if (await isAddressAllowed(address)) return;
    await blockedAddressRepository.upsert({
        address: rateLimitKey(address),
        source: 'automatic',
        reason: 'Repeated failed sign-ins',
        expiresAt: new Date(now + ADDRESS_BLOCK.blockMs),
        createdBy: null,
    });
    await signInFailureRepository.deleteByKey(key);
    clearAddressListCache();
}

async function recordAccountFailure(email: string): Promise<void> {
    const key = await accountKey(email);
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
