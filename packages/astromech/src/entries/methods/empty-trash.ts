import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { entryRepository } from '../repository/entries-table';

/**
 * Deletes each trashed entry of `type` with every locale, version and
 * relationship row. No entry hooks fire.
 */
export const emptyTrash = defineServiceMethod({
    summary: 'Permanently delete every trashed entry.',
    input: z.strictObject({ type: z.string() }),
    output: z.void(),
    access: entryAccess('delete'),
    requires: 'trash',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        await entryRepository.trash.emptyTrash(params.type);
    },
});
