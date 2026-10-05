/**
 * Blocked address repository: the only place Kysely touches the
 * `blocked_addresses` table. An automatic block never replaces a manual one.
 */

import type { BlockedAddressRow, NewBlockedAddressRow } from '../tables';
import { sql } from 'kysely';
import { encodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { blockedAddressesTable } from '@/database/tables';
import { compareTimestamps } from '@/database/timestamps';

function createBlockedAddressRepository() {
    const repository = createRepository(blockedAddressesTable);

    /** The blocks in force at `now`, newest first. */
    async function findActive(now: Date): Promise<BlockedAddressRow[]> {
        const rows = await repository.findMany({ orderBy: [['createdAt', 'desc']] });
        return rows.filter((row) => row.expiresAt === null || row.expiresAt > now);
    }

    async function findOne(id: string): Promise<BlockedAddressRow | null> {
        return repository.findOne({ id });
    }

    async function findByAddress(address: string): Promise<BlockedAddressRow | null> {
        return repository.findOne({ address });
    }

    /**
     * Block `row.address`. A manual block replaces the reason, expiry and author
     * of any block on the address. An automatic one only inserts, or lengthens
     * an automatic block already there: it leaves a manual block as it was.
     */
    async function upsert(row: NewBlockedAddressRow): Promise<void> {
        if (row.source === 'manual') {
            await repository.upsert(row, {
                target: ['address'],
                set: {
                    reason: row.reason,
                    source: row.source,
                    expiresAt: row.expiresAt,
                    createdBy: row.createdBy,
                },
            });
            return;
        }
        const { db, table } = repository.kysely();
        const expiresAt = row.expiresAt?.toISOString() ?? null;
        await db
            .insertInto(table)
            .values(encodeWith(blockedAddressesTable, row))
            .onConflict((conflict) =>
                conflict
                    .column('address')
                    .doUpdateSet({
                        expiresAt: sql<string>`CASE WHEN julianday(${sql.ref('expiresAt')}) >= julianday(${expiresAt}) THEN ${sql.ref('expiresAt')} ELSE ${expiresAt} END`,
                    })
                    .where('source', '=', 'automatic')
            )
            .execute();
    }

    async function del(where: { id: string }): Promise<void> {
        await repository.deleteMany(where);
    }

    /** Delete the blocks that ended by `now`. Returns how many went. */
    async function deleteExpired(now: Date): Promise<number> {
        const { db, table } = repository.kysely();
        const result = await db
            .deleteFrom(table)
            .where(compareTimestamps('expiresAt', '<=', now))
            .executeTakeFirst();
        return Number(result.numDeletedRows);
    }

    return { findActive, findOne, findByAddress, upsert, delete: del, deleteExpired };
}

/** The blocked address repository. Stateless: the db handle resolves per call. */
export const blockedAddressRepository = createBlockedAddressRepository();
