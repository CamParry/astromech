/** Allowed address repository: the only place Kysely touches the `allowed_addresses` table. */

import type { AllowedAddressRow, NewAllowedAddressRow } from '../tables';
import { createRepository } from '@/database/repository/create-repository';
import { allowedAddressesTable } from '@/database/tables';

function createAllowedAddressRepository() {
    const repository = createRepository(allowedAddressesTable);

    async function findMany(): Promise<AllowedAddressRow[]> {
        return repository.findMany({ orderBy: [['createdAt', 'desc']] });
    }

    async function findOne(where: { id: string }): Promise<AllowedAddressRow | null> {
        return repository.findOne(where);
    }

    /**
     * Add `row` and answer it, or null when its address is listed already. One
     * statement, so two concurrent adds of one address add it once.
     */
    async function createIfAbsent(
        row: NewAllowedAddressRow
    ): Promise<AllowedAddressRow | null> {
        const created = await repository.createMany([row], { onConflict: 'ignore' });
        return created === 1 ? repository.findOne({ address: row.address }) : null;
    }

    async function del(where: { id: string }): Promise<void> {
        await repository.deleteMany(where);
    }

    return { findMany, findOne, createIfAbsent, delete: del };
}

/** The allowed address repository. Stateless: the db handle resolves per call. */
export const allowedAddressRepository = createAllowedAddressRepository();
