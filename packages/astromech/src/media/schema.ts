import type { MediaMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineTable, type TableSelect, type TableInsert } from '@/database/define-table';

export const mediaTable = defineTable(
    'media',
    ({ col }) => ({
        id: col.id(),
        filename: col.text({ notNull: true }),
        mimeType: col.text({ notNull: true }),
        size: col.integer({ notNull: true }),
        width: col.integer(),
        height: col.integer(),
        alt: col.text(),
        fields: col.json(),
        metadata: col.json<MediaMetadata>(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users'),
        // Appended, not grouped with `alt`: SQLite's ADD COLUMN can only append,
        // and the column order has to match the migrated table or the
        // chain ↔ table DDL parity gate fails.
        title: col.text(),
        caption: col.text(),
    }),
    ({ index }) => [
        index('idx_media_mime', ['mimeType']),
        index('idx_media_created', ['createdAt']),
    ]
);

export type MediaRow = TableSelect<typeof mediaTable>;
export type NewMediaRow = TableInsert<typeof mediaTable>;

// ============================================================================
// Zod Schemas
// ============================================================================

export const updateMediaSchema = z
    .object({
        alt: z.string().optional(),
        title: z.string().optional(),
        caption: z.string().optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
    })
    .openapi('UpdateMedia');

const sortDirection = z.enum(['asc', 'desc']);

/**
 * Call schema for `media.query` — mirrors `MediaQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const mediaQuerySchema = z.object({
    search: z.string().optional(),
    where: z
        .object({
            mimeType: z.enum(['images', 'videos', 'documents', 'other']).optional(),
        })
        .optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: z
        .union([
            z.record(z.string(), sortDirection),
            z.array(z.record(z.string(), sortDirection)),
        ])
        .optional(),
});
