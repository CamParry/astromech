import { eq, desc, like, and, not, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import { mediaTable } from './schema.js';
import type { MediaRow } from './schema.js';
import { getDb } from '@/database/registry.js';
import { getStorageDriver } from '@/storage/registry.js';
import { deletePrefix } from '@/storage/prefix.js';
import { RelationshipsRepository } from '@/database/repositories/relationships.js';
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

export const mediaApi = {
    async query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
        const db = getDb();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        const conditions: SQL[] = [];

        if (params?.search) {
            conditions.push(like(mediaTable.filename, `%${params.search}%`));
        }

        const mimeType = params?.where?.mimeType;
        if (mimeType) {
            if (mimeType === 'images') {
                conditions.push(like(mediaTable.mimeType, 'image/%'));
            } else if (mimeType === 'videos') {
                conditions.push(like(mediaTable.mimeType, 'video/%'));
            } else if (mimeType === 'documents') {
                conditions.push(
                    sql`(${mediaTable.mimeType} LIKE 'application/%' OR ${mediaTable.mimeType} LIKE 'text/%')`
                );
            } else if (mimeType === 'other') {
                conditions.push(
                    not(
                        sql`(${mediaTable.mimeType} LIKE 'image/%' OR ${mediaTable.mimeType} LIKE 'video/%' OR ${mediaTable.mimeType} LIKE 'application/%' OR ${mediaTable.mimeType} LIKE 'text/%')`
                    )
                );
            }
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        if (limit === 'all') {
            const rows = await db
                .select()
                .from(mediaTable)
                .where(where)
                .orderBy(desc(mediaTable.createdAt));
            return { data: rows.map(toMedia), pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, countRows] = await Promise.all([
            db
                .select()
                .from(mediaTable)
                .where(where)
                .orderBy(desc(mediaTable.createdAt))
                .limit(perPage)
                .offset(offset),
            db
                .select({ count: sql<number>`count(*)` })
                .from(mediaTable)
                .where(where),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows.map(toMedia),
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
        const rows = await db
            .select()
            .from(mediaTable)
            .where(eq(mediaTable.id, id))
            .limit(1);
        const row = rows[0];
        return row ? toMedia(row) : null;
    },

    async upload(file: File): Promise<Media> {
        const db = getDb();
        const driver = getStorageDriver();
        if (!driver) throw new Error('Storage driver not configured');

        const id = crypto.randomUUID();
        const ext = extOf(file.name);
        const key = ext ? `${id}.${ext}` : id;

        const { width, height, metadata } = await storeFile(driver, key, file);

        const rows = await db
            .insert(mediaTable)
            .values({
                id,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata,
            })
            .returning();

        if (rows.length > 0 && rows[0]) {
            return toMedia(rows[0]);
        }

        throw new Error('Failed to upload media');
    },

    async update(
        id: string,
        data: Partial<{ alt: string; title: string; fields: JsonObject }>
    ): Promise<Media> {
        const validatedData = validate(updateMediaSchema, data);
        const db = getDb();
        const rows = await db
            .update(mediaTable)
            .set({
                ...(validatedData.alt !== undefined && { alt: validatedData.alt }),
                ...(validatedData.fields !== undefined && {
                    fields: validatedData.fields as JsonObject,
                }),
                updatedAt: new Date(),
            })
            .where(eq(mediaTable.id, id))
            .returning();

        if (rows.length > 0 && rows[0]) {
            return toMedia(rows[0]);
        }

        throw new Error('Failed to update media');
    },

    async delete(id: string): Promise<void> {
        const db = getDb();
        const driver = getStorageDriver();

        if (driver) {
            const rows = await db
                .select()
                .from(mediaTable)
                .where(eq(mediaTable.id, id))
                .limit(1);
            if (rows[0]) {
                const row = rows[0];
                const ext = extOf(row.filename);
                const key = ext ? `${row.id}.${ext}` : row.id;
                await driver.delete(key);
                await deletePrefix(driver, variantPrefix(id));
            }
        }

        await new RelationshipsRepository(getDb()).deleteByMedia(id);
        await db.delete(mediaTable).where(eq(mediaTable.id, id));
    },

    async replace(id: string, file: File): Promise<Media> {
        const db = getDb();
        const driver = getStorageDriver();
        if (!driver) throw new Error('Storage driver not configured');

        const existing = await db
            .select()
            .from(mediaTable)
            .where(eq(mediaTable.id, id))
            .limit(1);
        if (!existing[0]) throw new Error(`Media '${id}' not found`);

        const row = existing[0];
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

        const rows = await db
            .update(mediaTable)
            .set({
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata,
                updatedAt: new Date(),
            })
            .where(eq(mediaTable.id, id))
            .returning();

        if (rows.length > 0 && rows[0]) {
            return toMedia(rows[0]);
        }

        throw new Error('Failed to replace media');
    },
};
