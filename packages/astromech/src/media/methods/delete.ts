import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { mediaRepository } from '../repository';
import { variantPrefix } from '../serving/image/url';

/**
 * Also deletes the original file and every derived variant from storage. A
 * missing item is a no-op.
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

        if (row) {
            await driver.delete(originalKey(row.id, row.filename));
            await deletePrefix(driver, variantPrefix(id));
        }

        // `delete` removes the item's relationship rows, then the item.
        await transaction(() => mediaRepository.delete(id));
    },
});
