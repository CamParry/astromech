/** The hourly job that keeps the sign-in failure table from growing without bound. */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { contextAs, createTestDb } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { securityCleanupJob } from '@/security/jobs/security-cleanup';
import { recordSignInFailure } from '@/security/sign-in-failures';

const HOUR = 60 * 60_000;

let db: Kysely<DB>;

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    db = await createTestDb();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('security-cleanup', () => {
    it('forgets accounts idle for a day and keeps a recent failure', async () => {
        await recordSignInFailure({ email: 'idle@test.dev', address: undefined });
        for (let i = 0; i < 5; i++) {
            await recordSignInFailure({ email: 'locked@test.dev', address: undefined });
        }
        vi.setSystemTime(Date.now() + 25 * HOUR);
        await recordSignInFailure({ email: 'recent@test.dev', address: undefined });

        await securityCleanupJob.handler(contextAs(null));

        const remaining = await db
            .selectFrom('signInFailures')
            .select(['count', 'lockedUntil'])
            .execute();
        expect(remaining).toHaveLength(1);
        expect(remaining[0]?.count).toBe(1);
    });

    it('keeps a row whose lock is still running', async () => {
        for (let i = 0; i < 5; i++) {
            await recordSignInFailure({ email: 'locked@test.dev', address: undefined });
        }
        await db
            .updateTable('signInFailures')
            .set({
                lockedUntil: Date.now() + 10 * HOUR,
                windowStart: Date.now() - 30 * HOUR,
            })
            .execute();

        await securityCleanupJob.handler(contextAs(null));

        expect(
            await db.selectFrom('signInFailures').select('key').execute()
        ).toHaveLength(1);
    });
});
