import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { generatePreviewSecret, hashPreviewToken } from '../../internal/preview';
import { getEntryResource } from '../../internal/read-entry';
import { entryRepository } from '../../repository/entries-table';
import { previewTokenSchema } from '../../schema';

/**
 * How long a preview token lives when the caller names no expiry: 7 days.
 * There is no config key for it, because no caller has asked for one.
 */
export const DEFAULT_PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues the entry's preview token, authorizing every locale of it: returns the
 * plaintext once, stores only its hash. Throws when the type can't stage or the
 * read is a staged one. Omitted `expiresAt` takes the default TTL, explicit
 * null never expires.
 */
export const issuePreviewToken = defineServiceMethod({
    summary: 'Issue a preview token for an entry.',
    input: issuePreviewTokenInput({ type: z.string() }),
    output: z.object({ token: z.string() }),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params): Promise<{ token: string }> {
        const { type, id } = params;
        const canonical = await getEntryResource(type, id);
        if (canonical.staged) {
            throw new Error(
                `Entry '${id}' read as a staged change; issue the preview token on its canonical row.`
            );
        }
        const token = generatePreviewSecret();
        const hash = await hashPreviewToken(token);
        // Already coerced by the method's `input` parse: a JSON transport sends an
        // ISO string, and `previewTokenSchema` reads it as a date.
        const { expiresAt } = params;
        // `null` is not the same as absent: an omitted `expiresAt` takes the default
        // TTL, an explicit `null` means "never expires". The repository's `isValid`
        // honours null.
        const expiry =
            expiresAt === undefined
                ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
                : expiresAt;
        await entryRepository.previewToken.set(id, hash, expiry);
        return { token };
    },
});

/**
 * Revokes the entry's preview token. Throws when the type can't stage or no
 * entry of that type matches the id.
 */
export const revokePreviewToken = defineServiceMethod({
    summary: 'Revoke the preview token of an entry.',
    input: revokePreviewTokenInput({ type: z.string() }),
    output: z.void(),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params): Promise<void> {
        const { type, id } = params;
        await getEntryResource(type, id);
        await entryRepository.previewToken.clear(id);
    },
});

/**
 * `entries.issuePreviewToken`'s input, with `type` as given: any type id on the
 * method, one type's literal in that type's catalogue. `previewTokenSchema`
 * coerces an ISO string, which is what a JSON caller sends.
 */
export function issuePreviewTokenInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string() }).extend(previewTokenSchema.shape);
}

/**
 * `entries.revokePreviewToken`'s input, with `type` as given: any type id on the
 * method, one type's literal in that type's catalogue.
 */
export function revokePreviewTokenInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string() });
}
