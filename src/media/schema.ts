import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { MediaMetadata } from '@/types/index.js';
import { usersTable } from '@/users/schema.js';
import { z } from '@hono/zod-openapi';

// ============================================================================
// Media Table
// ============================================================================

export const mediaTable = sqliteTable(
    'media',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        filename: text('filename').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        width: integer('width'),
        height: integer('height'),
        alt: text('alt'),
        fields: text('fields', { mode: 'json' }),
        metadata: text('metadata', { mode: 'json' }).$type<MediaMetadata>(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
    },
    (table) => ({
        mimeTypeIdx: index('idx_media_mime').on(table.mimeType),
        createdAtIdx: index('idx_media_created').on(table.createdAt),
    })
);

export type MediaRow = typeof mediaTable.$inferSelect;
export type NewMediaRow = typeof mediaTable.$inferInsert;

// ============================================================================
// Zod Schemas
// ============================================================================

export const updateMediaSchema = z
    .object({
        alt: z.string().optional(),
        title: z.string().optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
    })
    .openapi('UpdateMedia');
