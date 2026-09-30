import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryResource } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';

/** A missing entry, or one of another type, throws. */
export const revokePreviewToken = defineServiceMethod({
    summary: 'Revoke the preview token of an entry.',
    input: z.strictObject({ type: z.string(), id: z.string() }),
    output: z.void(),
    access: entryAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params): Promise<void> {
        const { type, id } = params;

        await getEntryResource(type, id);

        await entryRepository.previewToken.clear(id);
    },
});
