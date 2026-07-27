import type { Insertable, Updateable, ExpressionBuilder } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { MediaRow } from './schema.js';
import { getDb } from '@/database/registry.js';
import type { DB } from '@/database/types.js';
import { encode, encodePatch, decode } from '@/database/codec.js';
import { getStorageDriver } from '@/storage/registry.js';
import { deletePrefix } from '@/storage/prefix.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import type {
    Media,
    JsonObject,
    QueryResult,
    MediaQueryParams,
    MediaMetadata,
    StorageDriver,
} from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { updateMediaSchema } from './schema.js';
import { processFields } from '@/fields/pipeline.js';
import { flattenFieldNodes } from '@/fields/helpers.js';
import { scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import { getCurrentUser } from '@/context/index.js';
import { buildMediaUrl, variantPrefix } from './serving/image/url.js';
import { isOptimisableImage, readImageDimensions } from './serving/image/dimensions.js';
import { contentVersion } from './serving/image/version.js';
import { getImageConfig } from './serving/image/registry.js';
import config from 'virtual:astromech/config';

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

/** File extension (without the dot), or '' when the filename has none. */
function extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1) : '';
}

function toMedia(row: MediaRow): Media {
    return {
        ...row,
        url: buildMediaUrl(config.mediaRoute, row.id, extOf(row.filename)),
    } as Media;
}

/**
 * Store an uploaded file under `key` and extract image metadata.
 *
 * Optimisable images are buffered once — their bytes are needed for dimension
 * extraction, the blurhash placeholder, and the content-hash version. Every
 * other type (video, PDF, …) is streamed straight to storage and never buffered
 * (the "stream, never buffer" abuse guard, spec §8).
 */
async function storeFile(
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

function buildMediaWhere(eb: ExpressionBuilder<DB, 'media'>, params?: MediaQueryParams) {
    const conditions = [];

    if (params?.search) {
        conditions.push(eb('filename', 'like', `%${params.search}%`));
    }

    const mimeType = params?.where?.mimeType;
    if (mimeType) {
        if (mimeType === 'images') {
            conditions.push(eb('mimeType', 'like', 'image/%'));
        } else if (mimeType === 'videos') {
            conditions.push(eb('mimeType', 'like', 'video/%'));
        } else if (mimeType === 'documents') {
            conditions.push(
                eb.or([
                    eb('mimeType', 'like', 'application/%'),
                    eb('mimeType', 'like', 'text/%'),
                ])
            );
        } else if (mimeType === 'other') {
            // NOT (image/* OR video/* OR application/* OR text/*)
            // Raw sql uses snake_case col — CamelCasePlugin does not transform raw fragments.
            conditions.push(
                sql<boolean>`mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'application/%' AND mime_type NOT LIKE 'text/%'`
            );
        }
    }

    return conditions.length > 0 ? eb.and(conditions) : undefined;
}

export const mediaApi = {
    async query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
        const db = getDb();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        if (limit === 'all') {
            const rows = await db
                .selectFrom('media')
                .selectAll()
                .where((eb) => buildMediaWhere(eb, params) ?? eb.lit(true))
                .orderBy('createdAt', 'desc')
                .execute();
            return {
                data: rows.map((r) => toMedia(decode('media', r) as unknown as MediaRow)),
                pagination: null,
            };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, countRow] = await Promise.all([
            db
                .selectFrom('media')
                .selectAll()
                .where((eb) => buildMediaWhere(eb, params) ?? eb.lit(true))
                .orderBy('createdAt', 'desc')
                .limit(perPage)
                .offset(offset)
                .execute(),
            db
                .selectFrom('media')
                .select((eb) => [eb.fn.countAll<number>().as('c')])
                .where((eb) => buildMediaWhere(eb, params) ?? eb.lit(true))
                .executeTakeFirst(),
        ]);

        const total = Number(countRow?.c ?? 0);
        return {
            data: rows.map((r) => toMedia(decode('media', r) as unknown as MediaRow)),
            pagination: {
                page,
                limit: perPage,
                total,
                pages: Math.ceil(total / perPage),
            },
        };
    },

    async get(id: string): Promise<Media | null> {
        const db = getDb();
        const row = await db
            .selectFrom('media')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        return row ? toMedia(decode('media', row) as unknown as MediaRow) : null;
    },

    async upload(file: File): Promise<Media> {
        const db = getDb();
        const driver = getStorageDriver();
        if (!driver) throw new Error('Storage driver not configured');

        const id = crypto.randomUUID();
        const ext = extOf(file.name);
        const key = ext ? `${id}.${ext}` : id;

        const { width, height, metadata } = await storeFile(driver, key, file);

        const created = await db
            .insertInto('media')
            .values(
                encode('media', {
                    id,
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                    width,
                    height,
                    metadata,
                }) as unknown as Insertable<DB['media']>
            )
            .returningAll()
            .executeTakeFirst();

        if (created) {
            return toMedia(decode('media', created) as unknown as MediaRow);
        }

        throw new Error('Failed to upload media');
    },

    async update(
        id: string,
        data: Partial<{ alt: string; title: string; fields: JsonObject }>
    ): Promise<Media> {
        const validatedData = validate(updateMediaSchema, data);

        if (validatedData.fields !== undefined) {
            const current = await mediaApi.get(id);
            const fieldDefs = flattenFieldNodes(config.media?.fields ?? []);
            const processed = await processFields(
                validatedData.fields as Record<string, unknown>,
                fieldDefs,
                {
                    operation: 'update',
                    host: { kind: 'media', record: current },
                    user: getCurrentUser(),
                    reads: scopedReadsFromRecords({
                        load: async () => (await mediaApi.query({ limit: 'all' })).data,
                        getId: (r) => r.id,
                        getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                        excludeId: id,
                    }),
                }
            );
            if (Object.keys(processed.errors).length > 0) {
                throw ValidationError.fromFieldErrors(processed.errors);
            }
            validatedData.fields = processed.values as JsonObject;
        }

        const db = getDb();
        const updated = await db
            .updateTable('media')
            .set(
                encodePatch('media', {
                    ...(validatedData.alt !== undefined && { alt: validatedData.alt }),
                    ...(validatedData.fields !== undefined && {
                        fields: validatedData.fields as JsonObject,
                    }),
                    updatedAt: new Date(),
                }) as unknown as Updateable<DB['media']>
            )
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();

        if (updated) {
            return toMedia(decode('media', updated) as unknown as MediaRow);
        }

        throw new Error('Failed to update media');
    },

    async delete(id: string): Promise<void> {
        const db = getDb();
        const driver = getStorageDriver();

        if (driver) {
            const row = await db
                .selectFrom('media')
                .selectAll()
                .where('id', '=', id)
                .limit(1)
                .executeTakeFirst();
            if (row) {
                const decoded = decode('media', row) as unknown as MediaRow;
                const ext = extOf(decoded.filename);
                const key = ext ? `${decoded.id}.${ext}` : decoded.id;
                await driver.delete(key);
                await deletePrefix(driver, variantPrefix(id));
            }
        }

        await createRelationshipStorage(getDb()).deleteByMedia(id);
        await db.deleteFrom('media').where('id', '=', id).execute();
    },

    async replace(id: string, file: File): Promise<Media> {
        const db = getDb();
        const driver = getStorageDriver();
        if (!driver) throw new Error('Storage driver not configured');

        const existingRaw = await db
            .selectFrom('media')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        if (!existingRaw) throw new Error(`Media '${id}' not found`);

        const row = decode('media', existingRaw) as unknown as MediaRow;
        const newExt = extOf(file.name);
        const newKey = newExt ? `${id}.${newExt}` : id;
        const oldExt = extOf(row.filename);
        const oldKey = oldExt ? `${id}.${oldExt}` : id;

        const { width, height, metadata } = await storeFile(driver, newKey, file);

        // Drop the previous original when the extension (hence key) changed, so a
        // cross-extension replace doesn't leave the old bytes orphaned.
        if (oldKey !== newKey) {
            await driver.delete(oldKey);
        }
        await deletePrefix(driver, variantPrefix(id));

        const updated = await db
            .updateTable('media')
            .set(
                encodePatch('media', {
                    filename: file.name,
                    mimeType: file.type,
                    size: file.size,
                    width,
                    height,
                    metadata,
                    updatedAt: new Date(),
                }) as unknown as Updateable<DB['media']>
            )
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();

        if (updated) {
            return toMedia(decode('media', updated) as unknown as MediaRow);
        }

        throw new Error('Failed to replace media');
    },
};
