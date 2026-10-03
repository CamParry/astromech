import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { ulid } from 'ulidx';
import { prepareFields } from '@/content/prepare-fields';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { jsonObject } from '@/services/json';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { storeFile } from '../internal/store-file';
import { syncMediaRelationships } from '../relationships';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';

/**
 * Parses `fields` as a create, then writes the file to storage, then inserts
 * the item with `fields` as its default-locale content row. Fields that fail
 * validation refuse the upload before anything is stored.
 */
export const uploadMedia = defineServiceMethod({
    summary: 'Upload a new media file.',
    input: z.strictObject({ file: z.instanceof(File), fields: jsonObject.optional() }),
    binaryInput: true,
    output: mediaSchema,
    access: 'media:upload',
    mutates: true,
    async handler(params, ctx): Promise<MediaResource> {
        const { file } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const driver = getStorageDriver();

        const fields = await prepareFields({
            resource: 'media',
            config,
            operation: 'create',
            user,
            values: params.fields ?? {},
        });

        // Minted here, not by the column default: the file is stored under it first.
        const id = ulid();
        const key = originalKey(id, file.name);
        const { width, height, metadata } = await storeFile(driver, key, file);

        return transaction(async () => {
            const created = await mediaRepository.create(
                {
                    id,
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                    width,
                    height,
                    metadata,
                    createdBy: userId,
                    updatedBy: userId,
                },
                { fields, createdBy: userId, updatedBy: userId }
            );
            await syncMediaRelationships(config, id);
            return created;
        });
    },
});
