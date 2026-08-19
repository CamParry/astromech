/**
 * Preview-token storage.
 *
 * Persists per-canonical-entry preview secrets for forward versioning. Only the
 * SHA-256 hash of a token is ever stored; the plaintext is shown once at issue.
 * One active token per entry: issuing replaces any existing token.
 */

import type { Db } from '@/database/types';
import { getDb } from '@/database/registry';
import { entryPreviewTokensTable } from '@/database/schema';
import { createStorage } from '@/database/storage/create-storage';

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
    const storage = createStorage(entryPreviewTokensTable, db);

    /** Replace any existing token for `entryId` with a freshly-hashed one. */
    async function issue(
        entryId: string,
        tokenHash: string,
        expiresAt: Date | null,
        createdBy: string | null
    ): Promise<void> {
        await storage.deleteMany({ entryId });
        await storage.create({
            entryId,
            token: tokenHash,
            expiresAt,
            createdBy,
        });
    }

    /** Remove all preview tokens for `entryId`. */
    async function revoke(entryId: string): Promise<void> {
        await storage.deleteMany({ entryId });
    }

    /** True if `tokenHash` is a current (non-expired) token for `entryId`. */
    async function isValid(
        entryId: string,
        tokenHash: string,
        now: Date
    ): Promise<boolean> {
        // The "no expiry OR still in the future" comparison is an OR across two
        // columns, which the flat `where` DSL cannot express, so this stays on
        // the raw `query()` escape hatch — which means it also owns its own
        // serialization. Tier-1 timestamps are ISO-TEXT; ISO strings compare
        // correctly with `>`.
        const nowIso = now.toISOString();
        const { db: handle, table } = storage.query();
        const rows = await handle
            .selectFrom(table)
            .select('id')
            .where((eb) =>
                eb.and([
                    eb('entryId', '=', entryId),
                    eb('token', '=', tokenHash),
                    eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', nowIso)]),
                ])
            )
            .limit(1)
            .execute();
        return rows.length > 0;
    }

    return { issue, revoke, isValid };
}
