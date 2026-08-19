import type { TableInsert, TableSelect } from '@/database/define-table';
import type { MediaMetadata } from '@/types/index';
import { defineTable } from '@/database/define-table';

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
