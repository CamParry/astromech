/** Writing an uploaded file to the blob store, shared by `upload` and `replace`. */

import type { MediaMetadata, StorageDriver } from '@/types/index';
import { isOptimisableImage, readImageDimensions } from '../serving/image/dimensions';
import { getImageConfig } from '../serving/image/registry';
import { contentVersion } from '../serving/image/version';

/**
 * Store an uploaded file under `key` and extract image metadata.
 *
 * Optimisable images are buffered once — their bytes are needed for dimension
 * extraction, the blurhash placeholder, and the content-hash version. Every
 * other type (video, PDF, …) is streamed straight to storage and never buffered
 * (the "stream, never buffer" abuse guard, spec §8).
 */
export async function storeFile(
    driver: StorageDriver,
    key: string,
    file: File
): Promise<{ width: number | null; height: number | null; metadata: MediaMetadata }> {
    if (isOptimisableImage(file.type)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const dims = readImageDimensions(bytes);
        const blurhash = (await getImageConfig()?.driver.placeholder?.(bytes)) ?? null;
        const version = await contentVersion(bytes);
        await driver.put(key, bytes, { contentType: file.type });
        return {
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            metadata: { blurhash, version },
        };
    }

    await driver.put(key, file.stream(), { contentType: file.type });
    return { width: null, height: null, metadata: {} };
}
