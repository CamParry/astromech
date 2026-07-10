import type { MediaMetadata } from '@/types/index.js';
import { z } from '@hono/zod-openapi';
import {
    defineTable,
    type TableSelect,
    type TableInsert,
} from '@/database/define-table.js';

export const media = defineTable(
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
    }),
    ({ index }) => [
        index('idx_media_mime', ['mimeType']),
        index('idx_media_created', ['createdAt']),
    ]
);

export type MediaRow = TableSelect<typeof media>;
export type NewMediaRow = TableInsert<typeof media>;

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
