import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { assertCapability } from '../../internal/entry-type';
import { generatePreviewSecret, hashPreviewToken } from '../../internal/preview';
import { getEntryResource } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';
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
    input: z
        .object({ type: z.string(), id: z.string() })
        .extend(previewTokenSchema.shape),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(
        params: {
            type: string;
            id: string;
            expiresAt?: Date | null;
        },
        ctx
    ): Promise<{ token: string }> {
        const { type, id } = params;
        assertCapability(ctx.config, type, 'staging');
        const repository = getEntryRepository(type);
        const canonical = await getEntryResource(ctx.config, repository, type, id);
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
        await repository.previewToken?.set(id, hash, expiry);
        return { token };
    },
});

/**
 * Revokes the entry's preview token. Throws when the type can't stage or no
 * entry of that type matches the id.
 */
export const revokePreviewToken = defineServiceMethod({
    summary: 'Revoke the preview token of an entry.',
    input: z.object({ type: z.string(), id: z.string() }),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params: { type: string; id: string }, ctx): Promise<void> {
        const { type, id } = params;
        assertCapability(ctx.config, type, 'staging');
        const repository = getEntryRepository(type);
        await getEntryResource(ctx.config, repository, type, id);
        await repository.previewToken?.clear(id);
    },
});
