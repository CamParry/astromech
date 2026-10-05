/**
 * Sign-in failure repository: the only place Kysely touches the
 * `sign_in_failures` table, where accounts and addresses are counted alike.
 */

import type { SignInFailureRow } from '../tables';
import { createRepository } from '@/database/repository/create-repository';
import { signInFailuresTable } from '@/database/tables';

/** The counter a failure left behind: what decides whether to lock. */
export type SignInFailureCount = {
    count: number;
    lockCount: number;
    lockedUntil: number | null;
};

function createSignInFailureRepository() {
    const repository = createRepository(signInFailuresTable);

    /**
     * Count one failure at `now` against `key`. A window that started `windowMs`
     * or more before `now` starts again at one. One statement, so concurrent
     * failures each count once, on D1 too.
     */
    async function recordFailure(
        key: string,
        now: number,
        windowMs: number
    ): Promise<SignInFailureCount> {
        const { db, table } = repository.kysely();
        const elapsedBy = now - windowMs;
        const row = await db
            .insertInto(table)
            .values({
                id: crypto.randomUUID(),
                key,
                count: 1,
                windowStart: now,
                lockCount: 0,
                lockedUntil: null,
            })
            .onConflict((conflict) =>
                // Unqualified columns name the stored row, not the new one.
                conflict.column('key').doUpdateSet((eb) => ({
                    count: eb
                        .case()
                        .when('windowStart', '<=', elapsedBy)
                        .then(1)
                        .else(eb('count', '+', 1))
                        .end(),
                    windowStart: eb
                        .case()
                        .when('windowStart', '<=', elapsedBy)
                        .then(now)
                        .else(eb.ref('windowStart'))
                        .end(),
                }))
            )
            .returning(['count', 'lockCount', 'lockedUntil'])
            .executeTakeFirstOrThrow();
        return {
            count: Number(row['count']),
            lockCount: Number(row['lockCount']),
            lockedUntil: row['lockedUntil'] === null ? null : Number(row['lockedUntil']),
        };
    }

    /**
     * Lock `key` until `lockedUntil`, restart its count and raise its lock
     * level, when it still holds `limit` failures. Answers whether it did, so
     * two concurrent failures at the limit escalate once.
     */
    async function lock(
        key: string,
        limit: number,
        lockedUntil: number
    ): Promise<boolean> {
        const { db, table } = repository.kysely();
        const result = await db
            .updateTable(table)
            .set((eb) => ({
                count: 0,
                lockCount: eb('lockCount', '+', 1),
                lockedUntil,
            }))
            .where('key', '=', key)
            .where('count', '>=', limit)
            .executeTakeFirst();
        return Number(result.numUpdatedRows) === 1;
    }

    async function findByKey(key: string): Promise<SignInFailureRow | null> {
        return repository.findOne({ key });
    }

    async function deleteByKey(key: string): Promise<void> {
        await repository.deleteMany({ key });
    }

    /**
     * Delete the rows whose window started at or before `before` and whose lock,
     * if any, ended by `now`. Returns how many went.
     */
    async function deleteStale(before: number, now: number): Promise<number> {
        return repository.deleteMany({
            windowStart: { lte: before },
            or: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        });
    }

    return { recordFailure, lock, findByKey, deleteByKey, deleteStale };
}

/** The sign-in failure repository. Stateless: the db handle resolves per call. */
export const signInFailureRepository = createSignInFailureRepository();
