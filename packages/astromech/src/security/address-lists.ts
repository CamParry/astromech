/**
 * The block list and allow list, read once a minute per process or isolate. An
 * allow list entry beats every block that covers the same address.
 */

import type { AddressRange } from '@/utilities/ip-address';
import { createRegistry } from '@/registry';
import { allowedAddressRepository } from '@/security/repository/allowed-addresses';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import { isAddressInRange, parseAddressRange } from '@/utilities/ip-address';

/** How long each process or isolate keeps the lists before reading them again. */
export const ADDRESS_LIST_TTL_MS = 60_000;

type AddressLists = {
    blocked: { range: AddressRange; expiresAt: number | null }[];
    allowed: AddressRange[];
};

/** One load of the lists, shared by every request that arrives while it is fresh. */
type AddressListCache = { loadedAt: number; lists: Promise<AddressLists> };

const cache = createRegistry<AddressListCache>('addressLists', { required: false });

/** Whether `address` is blocked: some active block covers it and no allowed entry does. */
export async function isAddressBlocked(address: string): Promise<boolean> {
    const { blocked, allowed } = await readAddressLists();
    if (allowed.some((range) => isAddressInRange(address, range))) return false;
    // A cached block can end inside the cache lifetime.
    const now = Date.now();
    return blocked.some(
        (block) =>
            (block.expiresAt === null || block.expiresAt > now) &&
            isAddressInRange(address, block.range)
    );
}

/** Whether some allowed entry covers `address`. */
export async function isAddressAllowed(address: string): Promise<boolean> {
    const { allowed } = await readAddressLists();
    return allowed.some((range) => isAddressInRange(address, range));
}

/** Drop this process's copy, after a local write. */
export function clearAddressListCache(): void {
    cache.clear();
}

async function readAddressLists(): Promise<AddressLists> {
    const now = Date.now();
    const existing = cache.get();
    if (existing !== null && now - existing.loadedAt < ADDRESS_LIST_TTL_MS) {
        return existing.lists;
    }
    const entry: AddressListCache = { loadedAt: now, lists: loadAddressLists(now) };
    cache.set(entry);
    try {
        return await entry.lists;
    } catch (error) {
        // A failed load is not kept, so the next request reads again.
        if (cache.get() === entry) cache.clear();
        throw error;
    }
}

async function loadAddressLists(now: number): Promise<AddressLists> {
    const [blockedRows, allowedRows] = await Promise.all([
        blockedAddressRepository.findActive(new Date(now)),
        allowedAddressRepository.findMany(),
    ]);
    const blocked: AddressLists['blocked'] = [];
    for (const row of blockedRows) {
        const range = parseAddressRange(row.address);
        if (range !== undefined) {
            blocked.push({ range, expiresAt: row.expiresAt?.getTime() ?? null });
        }
    }
    const allowed: AddressRange[] = [];
    for (const row of allowedRows) {
        const range = parseAddressRange(row.address);
        if (range !== undefined) allowed.push(range);
    }
    return { blocked, allowed };
}
