import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { removeFiles } from '../internal/remove-files';
import { mediaRepository } from '../repository';

/**
 * Also deletes the original file and every derived variant from storage, once
 * the row is gone. A missing item is a no-op.
 */
export const deleteMedia = defineServiceMethod({
    summary: 'Delete a media item.',
    input: z.strictObject({ id: z.string() }),
    output: z.void(),
    access: 'media:delete',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { id } = params;
        const driver = getStorageDriver();

        const row = await mediaRepository.findOne(id);

        // `delete` removes the item's relationship rows, then the item.
        await transaction(() => mediaRepository.delete(id));

        if (row) await removeFiles(driver, id, originalKey(row.id, row.filename));
    },
});
