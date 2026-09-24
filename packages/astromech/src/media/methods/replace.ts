import type { Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { toMedia } from '../internal/to-media';
import { getMediaRepository } from '../repository';
import { variantPrefix } from '../serving/image/url';

/** Swap a media item's file, keeping its id, URL shape and metadata row. */
export const replaceMedia = defineServiceMethod({
    summary: 'Replace a media item’s file, keeping its id, URL and metadata.',
    input: z.object({ id: z.string(), file: z.instanceof(File) }),
    binaryInput: true,
    access: 'media:upload',
    mutates: true,
    destructive: true,
    async handler(params, ctx): Promise<Media> {
        const { id, file } = params;
        const repository = getMediaRepository();
        const driver = getStorageDriver();

        const row = await repository.findOne(id);
        if (!row) throw new ResourceNotFoundError('media', { id });

        const newKey = originalKey(id, file.name);
        const oldKey = originalKey(id, row.filename);

        const { width, height, metadata } = await storeFile(driver, newKey, file);

        // Drop the previous original when the extension (hence key) changed, so
        // a cross-extension replace doesn't leave the old bytes orphaned.
        if (oldKey !== newKey) {
            await driver.delete(oldKey);
        }
        await deletePrefix(driver, variantPrefix(id));

        // The file columns only: replacing the bytes changes no authored
        // content, so no content row and no version is written.
        await repository.updateFile(id, {
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            metadata,
            updatedBy: ctx.user?.id ?? null,
        });

        const updated = await repository.findOne(id);
        if (!updated) throw new ResourceNotFoundError('media', { id });
        return toMedia(ctx.config, updated);
    },
});
