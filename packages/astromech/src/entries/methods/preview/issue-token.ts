import { z } from '@hono/zod-openapi';
import { ResourceConflictError, ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { sha256Hex } from '@/utilities/hash';
import { entryAccess } from '../../internal/access';
import {
    DEFAULT_PREVIEW_TOKEN_TTL_MS,
    generatePreviewSecret,
} from '../../internal/preview';
import { getEntryResource } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';
import { previewTokenSchema } from '../../schema';

/**
 * Opens every locale of the entry, replacing any earlier token, and answers the
 * plaintext once; only its hash is stored. An omitted `expiresAt` lasts seven
 * days, `null` never expires. A staged read throws; a trashed entry answers 409.
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
        if (canonical.deletedAt !== null) {
            throw new ResourceConflictError('entry', { id, reason: 'trashed' });
        }

        const token = generatePreviewSecret();
        const hash = await sha256Hex(token);
        const expiry =
            expiresAt === undefined
                ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
                : expiresAt;

        const stored = await entryRepository.previewToken.set(id, hash, expiry);
        if (stored === 'missing') throw new ResourceNotFoundError('entry', { id });
        if (stored === 'trashed') {
            throw new ResourceConflictError('entry', { id, reason: 'trashed' });
        }

        return { token };
    },
});
