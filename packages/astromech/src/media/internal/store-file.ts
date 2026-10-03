import type { MediaMetadata, StorageDriver } from '@/types/index';
import {
    isOptimisableImage,
    isReadableImage,
    readImageDimensions,
} from '../serving/image/dimensions';
import { removeGpsMetadata } from '../serving/image/gps';
import { getImageConfig } from '../serving/image/registry';
import { contentVersion } from '../serving/image/version';

/**
 * Store an uploaded file under `key` and extract image metadata. An image whose
 * header is readable is buffered once, has its GPS data blanked, and is measured
 * and hashed as stored; every other type streams straight to storage.
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
    await removeGpsMetadata(bytes);
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
