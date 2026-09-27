import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { ulid } from 'ulidx';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';

/**
 * Writes the file to storage, then inserts the item with an empty
 * default-locale content row.
 */
export const uploadMedia = defineServiceMethod({
    summary: 'Upload a new media file.',
    input: z.strictObject({ file: z.instanceof(File) }),
    binaryInput: true,
    output: mediaSchema,
    access: 'media:upload',
    mutates: true,
    async handler(params, ctx): Promise<MediaResource> {
        const { file } = params;
        const { user } = ctx;
        const userId = user?.id ?? null;
        const driver = getStorageDriver();

        // Minted here, not by the column default: the file is stored under it first.
        const id = ulid();
        const key = originalKey(id, file.name);
        const { width, height, metadata } = await storeFile(driver, key, file);

        return transaction(() =>
            mediaRepository.create(
                {
                    id,
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                    width,
                    height,
                    metadata,
                    createdBy: userId,
                    updatedBy: userId,
                },
                { fields: {}, createdBy: userId, updatedBy: userId }
            )
        );
    },
});
