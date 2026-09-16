import type { Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { ulid } from 'ulidx';
import { defineServiceMethod } from '@/services/define-service-method';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';

/** Store a new file and insert the row describing it. */
export const uploadMedia = defineServiceMethod({
    summary: 'Upload a new media file.',
    // `File` has no JSON Schema representation — the manifest generator's
    // `unrepresentable: 'any'` degrades it to `{}` rather than throwing, so
    // the emitted schema looks callable and isn't. `binaryInput` is what
    // says so out loud; a JSON-RPC transport skips the method by that flag
    // rather than by keeping its own list of exceptions.
    input: z.object({ file: z.instanceof(File) }),
    binaryInput: true,
    access: 'media:upload',
    mutates: true,
    async handler(params, ctx): Promise<Media> {
        const { file } = params;
        const driver = getStorageDriver();

        // Minted here rather than left to the column's `col.id()` default:
        // the storage key is derived from the id and the bytes are written
        // BEFORE the row is inserted, so the id has to exist first. `ulid()` is
        // the same generator the column default uses, so an explicit mint
        // agrees with the column instead of fighting it.
        const id = ulid();
        const key = originalKey(id, file.name);

        const { width, height, metadata } = await storeFile(driver, key, file);

        const actor = ctx.user?.id ?? null;

        // The resource row and its default-locale content row are one insert
        // pair: the repository wraps both in a transaction.
        return toMedia(
            ctx.config,
            await createMediaRepository(ctx.config).create(
                {
                    id,
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                    width,
                    height,
                    metadata,
                    createdBy: actor,
                    updatedBy: actor,
                },
                { fields: {}, createdBy: actor, updatedBy: actor }
            )
        );
    },
});
