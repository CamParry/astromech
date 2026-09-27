import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';
import { variantPrefix } from '../serving/image/url';

/**
 * Only the file columns change, so no content row or version is written. The
 * old original and every derived variant are deleted from storage.
 */
export const replaceMedia = defineServiceMethod({
    summary: 'Replace a media item’s file, keeping its id, URL and metadata.',
    input: z.strictObject({ id: z.string(), file: z.instanceof(File) }),
    binaryInput: true,
    output: mediaSchema,
    access: 'media:upload',
    mutates: true,
    destructive: true,
    async handler(params, ctx): Promise<MediaResource> {
        const { id, file } = params;
        const { user } = ctx;
        const userId = user?.id ?? null;
        const driver = getStorageDriver();

        const current = await mediaRepository.findOne(id);
        if (!current) throw new ResourceNotFoundError('media', { id });

        const key = originalKey(id, file.name);
        const oldKey = originalKey(id, current.filename);
        const { width, height, metadata } = await storeFile(driver, key, file);
        if (oldKey !== key) await driver.delete(oldKey);
        await deletePrefix(driver, variantPrefix(id));

        await mediaRepository.updateFile(id, {
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            metadata,
            updatedBy: userId,
        });

        const updated = await mediaRepository.findOne(id);
        if (!updated) throw new ResourceNotFoundError('media', { id });
        return updated;
    },
});
