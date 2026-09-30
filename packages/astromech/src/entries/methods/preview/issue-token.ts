import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import {
    DEFAULT_PREVIEW_TOKEN_TTL_MS,
    generatePreviewSecret,
    hashPreviewToken,
} from '../../internal/preview';
import { getEntryResource } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';
import { previewTokenSchema } from '../../schema';

/**
 * Opens every locale of the entry, replacing any earlier token. The plaintext is
 * answered once and only its hash is stored. An omitted `expiresAt` lasts seven
 * days and `null` never expires. An entry that reads as a staged change throws.
 */
export const issuePreviewToken = defineServiceMethod({
    summary: 'Issue a preview token for an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        ...previewTokenSchema.shape,
    }),
    output: z.object({ token: z.string() }),
    access: entryAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params): Promise<{ token: string }> {
        const { type, id, expiresAt } = params;

        const canonical = await getEntryResource(type, id);
        if (canonical.staged) {
            throw new Error(
                `Entry '${id}' read as a staged change; issue the preview token on its canonical row.`
            );
        }

        const token = generatePreviewSecret();
        const hash = await hashPreviewToken(token);
        const expiry =
            expiresAt === undefined
                ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
                : expiresAt;

        await entryRepository.previewToken.set(id, hash, expiry);

        return { token };
    },
});
