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
 * Only the file columns change, so no content row or version is written. An
 * original about to be overwritten is copied aside and put back if the write or
 * the row update fails. The old files and variants are removed after the commit.
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
        const copyKey = key === oldKey ? await copyOriginal(driver, id, key) : null;

        try {
            const { size, width, height, metadata } = await storeFile(driver, key, file);
            await mediaRepository.updateFile(id, {
                filename: file.name,
                mimeType: file.type,
                size,
                width,
                height,
                metadata,
                updatedBy: userId,
            });
        } catch (error) {
            await restoreOriginal(driver, current, key, copyKey);
            throw error;
        }

        await removeFiles(driver, id, key === oldKey ? copyKey : oldKey);

        const updated = await mediaRepository.findOne(id);
        if (!updated) throw new ResourceNotFoundError('media', { id });
        return updated;
    },
});

/** Copy the original at `key` to a key of its own, or return null when storage holds none. */
async function copyOriginal(
    driver: StorageDriver,
    id: string,
    key: string
): Promise<string | null> {
    const copyKey = `tmp/${crypto.randomUUID()}/${key}`;
    try {
        return (await copyFile(driver, key, copyKey)) ? copyKey : null;
    } catch (error) {
        log.warn(
            `Could not copy the stored original of media ${id} before a replace; ` +
                `a partial copy may be left at ${copyKey}`
        );
        throw error;
    }
}

/**
 * Put storage back as the row describes it, unless another write changed the
 * row's file first, then remove the copy and any variant built from the new
 * bytes. Logged rather than thrown, so the caller rethrows the write's own error.
 */
async function restoreOriginal(
    driver: StorageDriver,
    current: MediaResource,
    key: string,
    copyKey: string | null
): Promise<void> {
    const { id } = current;
    try {
        const row = await mediaRepository.findOne(id);
        if (row === null || !isSameFile(row, current)) {
            log.warn(
                `Did not restore the stored original of media ${id} after a failed replace: ` +
                    'another write changed or deleted it first'
            );
        } else if (copyKey === null) {
            await driver.delete(key);
        } else {
            await copyFile(driver, copyKey, key);
        }
    } catch (error) {
        log.error(
            `Could not restore the stored original of media ${id} after a failed replace` +
                (copyKey === null ? '' : `; the previous file is kept at ${copyKey}`) +
                `: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
    }
    await removeFiles(driver, id, copyKey);
}

/** Whether two reads of an item describe the same stored file. */
function isSameFile(a: MediaResource, b: MediaResource): boolean {
    return (
        a.filename === b.filename &&
        a.mimeType === b.mimeType &&
        a.size === b.size &&
        a.metadata?.version === b.metadata?.version
    );
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
