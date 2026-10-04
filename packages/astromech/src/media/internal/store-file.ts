import type { MediaMetadata, StorageDriver } from '@/types/index';
import {
    isOptimisableImage,
    isReadableImage,
    readImageDimensions,
} from '../serving/image/dimensions';
import { detectImageFormat } from '../serving/image/header';
import { getImageConfig } from '../serving/image/registry';
import { contentVersion } from '../serving/image/version';
import { removeGpsMetadata } from './gps';

/** How many bytes of a file are read to tell its format, enough for a HEIF file's brands. */
const FORMAT_SNIFF_BYTES = 64;

/**
 * Store an uploaded file under `key` and extract image metadata. An image whose
 * header is readable is buffered once, has its GPS data blanked, and is measured
 * and hashed as stored. A file of another declared type whose bytes are such an
 * image still has its GPS data blanked; any other file streams straight to storage.
 */
export async function storeFile(
    driver: StorageDriver,
    key: string,
    file: File
): Promise<{ width: number | null; height: number | null; metadata: MediaMetadata }> {
    const readable = isReadableImage(file.type);
    if (!readable && !(await mayHoldGps(file))) {
        await driver.put(key, file.stream(), {
            contentType: file.type,
            contentLength: file.size,
        });
        return { width: null, height: null, metadata: {} };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    await removeGpsMetadata(bytes);
    if (!readable) {
        await driver.put(key, bytes, { contentType: file.type });
        return { width: null, height: null, metadata: {} };
    }
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

/** Whether a file's first bytes are an image format that can carry GPS data. */
async function mayHoldGps(file: File): Promise<boolean> {
    const head = new Uint8Array(await file.slice(0, FORMAT_SNIFF_BYTES).arrayBuffer());
    const format = detectImageFormat(head);
    return format !== null && format !== 'gif';
}
