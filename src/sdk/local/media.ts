import { eq, desc, like, and, not, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import { mediaTable } from '@/db/schema.js';
import { getDb } from '@/db/registry.js';
import { getStorageDriver } from '@/storage/registry.js';
import type { Media, JsonObject, QueryResult, MediaQueryParams } from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { updateMediaSchema } from '@/schemas/media.js';

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
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
                conditions.push(sql`(${mediaTable.mimeType} LIKE 'application/%' OR ${mediaTable.mimeType} LIKE 'text/%')`);
            } else if (mimeType === 'other') {
                conditions.push(not(sql`(${mediaTable.mimeType} LIKE 'image/%' OR ${mediaTable.mimeType} LIKE 'video/%' OR ${mediaTable.mimeType} LIKE 'application/%' OR ${mediaTable.mimeType} LIKE 'text/%')`));
            }
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        if (limit === 'all') {
            const rows = await db.select().from(mediaTable).where(where).orderBy(desc(mediaTable.createdAt));
            return { data: rows as Media[], pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, countRows] = await Promise.all([
            db.select().from(mediaTable).where(where).orderBy(desc(mediaTable.createdAt)).limit(perPage).offset(offset),
            db.select({ count: sql<number>`count(*)` }).from(mediaTable).where(where),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows as Media[],
            pagination: { page, limit: perPage, total, pages: Math.ceil(total / perPage) },
        };
    },

    async get(id: string): Promise<Media | null> {
        const db = getDb();
        const rows = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1);
        return rows.length > 0 ? (rows[0]! as Media) : null;
    },

    async upload(file: File): Promise<Media> {
        const db = getDb();
        const driver = getStorageDriver();
        if (!driver) throw new Error('Storage driver not configured');

        const id = crypto.randomUUID();
        const ext = file.name.split('.').pop() ?? '';
        const path = ext ? `${id}.${ext}` : id;

        const url = await driver.upload(file, path);

        const rows = await db
            .insert(mediaTable)
            .values({
                id,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                url,
            })
            .returning();

        if (rows.length > 0 && rows[0]) {
            return rows[0] as Media;
        }

        throw new Error('Failed to upload media');
    },

    async update(id: string, data: Partial<{ alt: string; title: string; fields: JsonObject }>): Promise<Media> {
        const validatedData = validate(updateMediaSchema, data);
        const db = getDb();
        const rows = await db
            .update(mediaTable)
            .set({
                ...(validatedData.alt !== undefined && { alt: validatedData.alt }),
                ...(validatedData.fields !== undefined && { fields: validatedData.fields as JsonObject }),
                updatedAt: new Date(),
            })
            .where(eq(mediaTable.id, id))
            .returning();

        if (rows.length > 0 && rows[0]) {
            return rows[0] as Media;
        }

        throw new Error('Failed to update media');
    },

    async delete(id: string): Promise<void> {
        const db = getDb();
        const driver = getStorageDriver();

        if (driver) {
            const rows = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1);
            if (rows[0]) {
                // Derive storage path from URL (last segment: `{uuid}.{ext}`)
                const path = rows[0].url.split('/').slice(-1)[0]!;
                await driver.delete(path);
            }
        }

        await db.delete(mediaTable).where(eq(mediaTable.id, id));
    },
};
