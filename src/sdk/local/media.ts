import { eq, desc, like, and, not, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import { mediaTable } from '@/db/schema.js';
import type { MediaRow } from '@/db/schema.js';
import { getDb } from '@/db/registry.js';
import { getStorageDriver } from '@/storage/registry.js';
import { deletePrefix } from '@/storage/prefix.js';
import { RelationshipsRepository } from '@/db/repositories/relationships.js';
import type {
    Media,
    JsonObject,
    QueryResult,
    MediaQueryParams,
    MediaMetadata,
} from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { updateMediaSchema } from '@/schemas/media.js';
import { buildMediaUrl, variantPrefix } from '@/images/url.js';
import { isOptimisableImage, readImageDimensions } from '@/images/dimensions.js';
import { contentVersion } from '@/images/version.js';
import { getImageConfig } from '@/images/registry.js';
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

        const bytes = new Uint8Array(await file.arrayBuffer());

        let width: number | null = null;
        let height: number | null = null;
        let blurhash: string | null = null;

        if (isOptimisableImage(file.type)) {
            const dims = readImageDimensions(bytes);
            if (dims) {
                width = dims.width;
                height = dims.height;
            }
            const imageConfig = getImageConfig();
            blurhash = (await imageConfig?.driver.placeholder?.(bytes)) ?? null;
        }

        const version = await contentVersion(bytes);

        await driver.put(key, bytes, { contentType: file.type });

        const rows = await db
            .insert(mediaTable)
            .values({
                id,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata: { blurhash, version },
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
        const ext = extOf(file.name);
        const key = ext ? `${id}.${ext}` : id;

        const bytes = new Uint8Array(await file.arrayBuffer());

        let width: number | null = null;
        let height: number | null = null;
        let blurhash: string | null = null;

        if (isOptimisableImage(file.type)) {
            const dims = readImageDimensions(bytes);
            if (dims) {
                width = dims.width;
                height = dims.height;
            }
            const imageConfig = getImageConfig();
            blurhash = (await imageConfig?.driver.placeholder?.(bytes)) ?? null;
        }

        const version = await contentVersion(bytes);

        await driver.put(key, bytes, { contentType: file.type });
        await deletePrefix(driver, variantPrefix(id));

        const existingMeta: MediaMetadata = row.metadata ?? {};
        const rows = await db
            .update(mediaTable)
            .set({
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata: { ...existingMeta, blurhash, version },
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
