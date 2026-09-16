/**
 * The first-admin claim: one `settings` row that lets a single Better Auth
 * sign-up take `admin` on an empty install, taken by one atomic statement.
 */

import type { Repository } from '@/database/repository/create-repository';
import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import { settingsTable } from '@/database/tables';

/** The `settings` key holding the claim. Its value is when it was claimed. */
export const FIRST_ADMIN_CLAIM_KEY = 'astromech.first-admin-claim';

/**
 * How long a claim holds before another sign-up may take it over. A sign-up
 * that claimed but crashed or failed before its user insert must not close
 * first-run setup for good.
 */
export const FIRST_ADMIN_CLAIM_LEASE_MS = 60_000;

/**
 * Take the claim, or take over one older than the lease. `true` means this
 * caller holds it. Defaults to the registered db.
 */
export async function claimFirstAdmin(now: Date, db?: Db): Promise<boolean> {
    const repository = createRepository(settingsTable, db);
    const inserted = await repository.createMany(
        [{ key: FIRST_ADMIN_CLAIM_KEY, value: now.toISOString() }],
        { onConflict: 'ignore' }
    );
    if (inserted === 1) return true;
    return takeOverExpiredClaim(repository, now);
}

/** Delete the claim. Defaults to the registered db. */
export async function releaseFirstAdminClaim(db?: Db): Promise<void> {
    await createRepository(settingsTable, db).deleteMany({ key: FIRST_ADMIN_CLAIM_KEY });
}

/**
 * Compare-and-set over an expired claim. The update matches the exact value
 * read, so of two sign-ups taking over the same claim only one updates a row.
 */
async function takeOverExpiredClaim(
    repository: Repository<typeof settingsTable>,
    now: Date
): Promise<boolean> {
    const current = await repository.findOne({ key: FIRST_ADMIN_CLAIM_KEY });
    if (current === null || typeof current.value !== 'string') return false;
    const age = now.getTime() - Date.parse(current.value);
    if (age < FIRST_ADMIN_CLAIM_LEASE_MS) return false;
    const updated = await repository.updateMany(
        { key: FIRST_ADMIN_CLAIM_KEY, value: current.value },
        { value: now.toISOString() }
    );
    return updated === 1;
}
