/**
 * Preview-token storage.
 *
 * Persists per-canonical-entry preview secrets for forward versioning. Only the
 * SHA-256 hash of a token is ever stored; the plaintext is shown once at issue.
 * One active token per entry: issuing replaces any existing token.
 */

import type { Insertable } from 'kysely';
import { getDb } from '@/database/registry.js';
import { encode } from '@/database/codec.js';
import type { DB, Db } from '@/database/types.js';

export type PreviewTokenStorage = ReturnType<typeof createPreviewTokenStorage>;

/** SHA-256 hex of a token (crypto.subtle — Workers-safe). */
export async function hashPreviewToken(plaintext: string): Promise<string> {
    const bytes = new TextEncoder().encode(plaintext);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export function createPreviewTokenStorage(db: Db = getDb()) {
    /** Replace any existing token for `entryId` with a freshly-hashed one. */
    async function issue(
        entryId: string,
        tokenHash: string,
        expiresAt: Date | null,
        createdBy: string | null
    ): Promise<void> {
        await db
            .deleteFrom('entryPreviewTokens')
            .where('entryId', '=', entryId)
            .execute();
        await db
            .insertInto('entryPreviewTokens')
            .values(
                encode('entryPreviewTokens', {
                    entryId,
                    token: tokenHash,
                    expiresAt,
                    createdBy,
                }) as unknown as Insertable<DB['entryPreviewTokens']>
            )
            .execute();
    }

    /** Remove all preview tokens for `entryId`. */
    async function revoke(entryId: string): Promise<void> {
        await db
            .deleteFrom('entryPreviewTokens')
            .where('entryId', '=', entryId)
            .execute();
    }

    /** True if `tokenHash` is a current (non-expired) token for `entryId`. */
    async function isValid(
        entryId: string,
        tokenHash: string,
        now: Date
    ): Promise<boolean> {
        const nowSeconds = Math.floor(now.getTime() / 1000);
        const rows = await db
            .selectFrom('entryPreviewTokens')
            .select('id')
            .where((eb) =>
                eb.and([
                    eb('entryId', '=', entryId),
                    eb('token', '=', tokenHash),
                    eb.or([
                        eb('expiresAt', 'is', null),
                        eb('expiresAt', '>', nowSeconds),
                    ]),
                ])
            )
            .limit(1)
            .execute();
        return rows.length > 0;
    }

    return { issue, revoke, isValid };
}
