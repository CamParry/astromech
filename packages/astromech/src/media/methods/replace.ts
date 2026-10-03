import type { MediaResource } from '../repository';
import type { StorageDriver } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { getStorageDriver } from '@/storage/registry';
import { log } from '@/utilities/log';
import { originalKey } from '../internal/keys';
import { removeFiles } from '../internal/remove-files';
import { storeFile } from '../internal/store-file';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';

/**
 * Only the file columns change, so no content row or version is written. A new
 * file under the old key overwrites a copy kept until the row commits; a failed
 * write puts the old bytes back. Variants are deleted once the row is updated.
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
        const copyKey = key === oldKey ? await copyOriginal(driver, key) : null;

        try {
            const { width, height, metadata } = await storeFile(driver, key, file);
            await mediaRepository.updateFile(id, {
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata,
                updatedBy: userId,
            });
        } catch (error) {
            await restoreOriginal(driver, id, key, copyKey);
            throw error;
        }

        await removeFiles(driver, id, key === oldKey ? copyKey : oldKey);

        const updated = await mediaRepository.findOne(id);
        if (!updated) throw new ResourceNotFoundError('media', { id });
        return updated;
    },
});

/** Copy the original at `key` to a key of its own, or return null when storage holds none. */
async function copyOriginal(driver: StorageDriver, key: string): Promise<string | null> {
    const copyKey = `tmp/${crypto.randomUUID()}/${key}`;
    return (await copyFile(driver, key, copyKey)) ? copyKey : null;
}

/**
 * Put storage back as the row describes it: the copy over the new original, or
 * no file at `key` when there was no copy. Logged rather than thrown, so the
 * caller rethrows the write's own error.
 */
async function restoreOriginal(
    driver: StorageDriver,
    id: string,
    key: string,
    copyKey: string | null
): Promise<void> {
    try {
        if (copyKey === null) {
            await driver.delete(key);
            return;
        }
        await copyFile(driver, copyKey, key);
        await driver.delete(copyKey);
    } catch (error) {
        log.error(
            `Could not restore the stored original of media ${id} after a failed replace` +
                (copyKey === null ? '' : `; the previous file is kept at ${copyKey}`) +
                `: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/** Stream the file at `from` to `to` without buffering it. False when `from` is absent. */
async function copyFile(
    driver: StorageDriver,
    from: string,
    to: string
): Promise<boolean> {
    const object = await driver.get(from);
    if (object === null) return false;
    await driver.put(to, object.body, {
        contentLength: object.size,
        ...(object.contentType !== undefined ? { contentType: object.contentType } : {}),
    });
    return true;
}
