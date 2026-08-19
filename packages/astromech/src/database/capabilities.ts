/**
 * Driver capability probes.
 *
 * Probes rather than throws: the driver registry is unwired in plugin unit
 * tests and in some CLI paths, and an absent driver must read as "capable"
 * so nothing changes for the default libsql path.
 */

import { getDatabaseDriver } from '@/database/driver-registry';

/** False only when the active driver explicitly declares no interactive transactions (D1). */
export function supportsTransactions(): boolean {
    return getDatabaseDriver()?.supportsTransactions ?? true;
}
