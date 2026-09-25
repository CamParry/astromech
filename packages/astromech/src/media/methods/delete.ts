import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { mediaRepository } from '../repository';
import { variantPrefix } from '../serving/image/url';

/** Delete a media row along with its original bytes and every derived variant. */
export const deleteMedia = defineServiceMethod({
    summary: 'Delete a media item.',
    input: z.object({ id: z.string() }),
    access: 'media:delete',
    mutates: true,
    destructive: true,
    async handler(params): Promise<void> {
        const { id } = params;
        const driver = getStorageDriver();

        const row = await mediaRepository.findOne(id);
        if (row) {
            await driver.delete(originalKey(row.id, row.filename));
            await deletePrefix(driver, variantPrefix(id));
        }

        // The row and its index rows go together, as a user's do.
        await transaction(async () => {
            await mediaRepository.delete(id);
        });
    },
});
