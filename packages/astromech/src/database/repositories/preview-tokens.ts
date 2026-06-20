/**
 * Preview Tokens Repository
 *
 * Persists per-canonical-entry preview secrets for forward versioning. Only the
 * SHA-256 hash of a token is ever stored; the plaintext is shown once at issue.
 * One active token per entry: issuing replaces any existing token.
 */

import { eq, and, isNull, gt, or } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { entryPreviewTokensTable } from '@/database/schema';

/** SHA-256 hex of a token (crypto.subtle — Workers-safe). */
export async function hashPreviewToken(plaintext: string): Promise<string> {
    const bytes = new TextEncoder().encode(plaintext);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export class PreviewTokensRepository {
    constructor(private db: LibSQLDatabase) {}

    /** Replace any existing token for `entryId` with a freshly-hashed one. */
    async issue(
        entryId: string,
        tokenHash: string,
        expiresAt: Date | null,
        createdBy: string | null
    ): Promise<void> {
        await this.db
            .delete(entryPreviewTokensTable)
            .where(eq(entryPreviewTokensTable.entryId, entryId));
        await this.db.insert(entryPreviewTokensTable).values({
            entryId,
            token: tokenHash,
            expiresAt,
            createdBy,
        });
    }

    /** Remove all preview tokens for `entryId`. */
    async revoke(entryId: string): Promise<void> {
        await this.db
            .delete(entryPreviewTokensTable)
            .where(eq(entryPreviewTokensTable.entryId, entryId));
    }

    /** True if `tokenHash` is a current (non-expired) token for `entryId`. */
    async isValid(entryId: string, tokenHash: string, now: Date): Promise<boolean> {
        const rows = await this.db
            .select({ id: entryPreviewTokensTable.id })
            .from(entryPreviewTokensTable)
            .where(
                and(
                    eq(entryPreviewTokensTable.entryId, entryId),
                    eq(entryPreviewTokensTable.token, tokenHash),
                    or(
                        isNull(entryPreviewTokensTable.expiresAt),
                        gt(entryPreviewTokensTable.expiresAt, now)
                    )
                )
            )
            .limit(1);
        return rows.length > 0;
    }
}
