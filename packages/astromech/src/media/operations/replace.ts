import type { Media } from '@/types/index';
import { getCurrentUser } from '@/request-context/request-context';
import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { MediaNotFoundError } from '../errors';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';
import { variantPrefix } from '../serving/image/url.shared';

/** Swap a media item's file, keeping its id, URL shape and metadata row. */
export async function replaceMedia(params: { id: string; file: File }): Promise<Media> {
    const { id, file } = params;
    const repository = createMediaRepository();
    const driver = getStorageDriver();

    const row = await repository.get(id);
    if (!row) throw new MediaNotFoundError({ id });

    const newKey = originalKey(id, file.name);
    const oldKey = originalKey(id, row.filename);

    const { width, height, metadata } = await storeFile(driver, newKey, file);

    // Drop the previous original when the extension (hence key) changed, so a
    // cross-extension replace doesn't leave the old bytes orphaned.
    if (oldKey !== newKey) {
        await driver.delete(oldKey);
    }
    await deletePrefix(driver, variantPrefix(id));

    const user = await getCurrentUser();

    // The file columns only: replacing the bytes changes no authored content,
    // so no content row and no version is written.
    return toMedia(
        await repository.updateFile(id, {
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            metadata,
            updatedBy: user?.id ?? null,
        })
    );
}
