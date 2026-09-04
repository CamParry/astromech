/**
 * Preview (forward versioning) helpers: token secret generation + verification
 * and the preview projection (public shape with the publish gate bypassed).
 */

import type { AudienceContext } from '@/content/visibility';
import type { Entry, Field } from '@/types/index';
import { applyVisibility, markPublic } from '@/content/visibility';
import { createEntriesTableRepository } from '../repository/entries-table';

/** SHA-256 hex of a token (crypto.subtle — Workers-safe). */
export async function hashPreviewToken(plaintext: string): Promise<string> {
    const bytes = new TextEncoder().encode(plaintext);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Generate a high-entropy preview token secret (32 random bytes, hex). */
export function generatePreviewSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/** True if `token` is a current preview token for the canonical `entryId`. */
export async function verifyPreviewToken(
    entryId: string,
    token: string
): Promise<boolean> {
    const previewToken = createEntriesTableRepository().previewToken;
    const record = await previewToken.findByHash(await hashPreviewToken(token));
    if (!record || record.id !== entryId) return false;
    return record.expiresAt === null || record.expiresAt.getTime() > Date.now();
}

/** The audience a preview is filtered for: anonymous, as of now. */
export function previewAudience(): AudienceContext {
    return { role: null, now: new Date() };
}

/** Apply the preview projection (public shape, publish-gate bypassed). */
export function projectPreview(entry: Entry, fields: Field[]): Entry | null {
    const filtered = applyVisibility(entry, {
        shape: 'public',
        preview: true,
        fields,
        audience: previewAudience(),
    });
    return filtered ? markPublic(filtered) : null;
}
