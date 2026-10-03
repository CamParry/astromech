import type { MediaMetadata, StorageDriver } from '@/types/index';
import {
    isOptimisableImage,
    isReadableImage,
    readImageDimensions,
} from '../serving/image/dimensions';
import { getImageConfig } from '../serving/image/registry';
import { contentVersion } from '../serving/image/version';

/**
 * Store an uploaded file under `key` and extract image metadata. An image whose
 * header gives its dimensions is buffered once to read them, and an optimisable
 * one also gets its blurhash and version; every other type streams straight to
 * storage, never buffered.
 */
export async function storeFile(
    driver: StorageDriver,
    key: string,
    file: File
): Promise<{ width: number | null; height: number | null; metadata: MediaMetadata }> {
    if (!isReadableImage(file.type)) {
        await driver.put(key, file.stream(), {
            contentType: file.type,
            contentLength: file.size,
        });
        return { width: null, height: null, metadata: {} };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dimensions = readImageDimensions(bytes);
    const metadata = isOptimisableImage(file.type)
        ? {
              blurhash: (await getImageConfig()?.driver.placeholder?.(bytes)) ?? null,
              version: await contentVersion(bytes),
          }
        : {};
    await driver.put(key, bytes, { contentType: file.type });
    return {
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        metadata,
    };
}
