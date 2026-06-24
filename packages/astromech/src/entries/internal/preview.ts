/**
 * Preview (forward versioning) helpers: token secret generation + verification
 * and the preview projection (public shape with the publish gate bypassed).
 */

import {
    createPreviewTokenStorage,
    hashPreviewToken,
} from '../storage/preview-tokens.js';
import {
    applyVisibilityWithRelations,
    markPublic,
    type AudienceContext,
} from '../visibility.js';
import { resolveRelatedFields } from './type-config.js';
import type { Entry, FieldDefinition } from '@/types/index.js';

/** Generate a high-entropy preview token secret (32 random bytes, hex). */
export function generatePreviewSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** True if `token` is a current preview token for the canonical `entryId`. */
export async function verifyPreviewToken(
    entryId: string,
    token: string
): Promise<boolean> {
    const hash = await hashPreviewToken(token);
    return createPreviewTokenStorage().isValid(entryId, hash, new Date());
}

export const previewAudience = (): AudienceContext => ({
    roleSlug: null,
    now: new Date(),
});

/** Apply the preview projection (public shape, publish-gate bypassed). */
export function projectPreview(entry: Entry, fields: FieldDefinition[]): Entry | null {
    const filtered = applyVisibilityWithRelations(
        entry,
        { shape: 'public', preview: true, fields, audience: previewAudience() },
        resolveRelatedFields
    );
    return filtered ? markPublic(filtered) : null;
}
