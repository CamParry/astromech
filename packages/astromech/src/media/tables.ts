/**
 * The media tables — source of truth for row types and the codec. `media` is
 * the resource row, one per stored file, `media_content` holds one row per
 * locale of what editors author about it, and `media_versions` snapshots a
 * content row. The same three-table shape as globals, without status,
 * publishing or staging: a file carries no publish state of its own.
 */

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
        metadata: col.json<MediaMetadata>(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_media_mime', ['mimeType']),
        index('idx_media_created', ['createdAt']),
    ]
);

export const mediaContentTable = defineTable(
    'media_content',
    ({ col }) => ({
        id: col.id(),
        mediaId: col.reference(() => mediaTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        locale: col.text({ notNull: true }),
        title: col.text(),
        alt: col.text(),
        caption: col.text(),
        fields: col.json(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_media_content_media', ['mediaId']),
        index('media_content_media_locale_unique', ['mediaId', 'locale'], {
            unique: true,
        }),
    ]
);

export const mediaVersionsTable = defineTable(
    'media_versions',
    ({ col }) => ({
        id: col.id(),
        contentId: col.reference(() => mediaContentTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        version: col.integer({ notNull: true }),
        title: col.text(),
        alt: col.text(),
        caption: col.text(),
        fields: col.json(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [index('idx_media_versions_content', ['contentId', 'version'])]
);

export type MediaTableRow = TableSelect<typeof mediaTable>;
export type NewMediaTableRow = TableInsert<typeof mediaTable>;

export type MediaContentRow = TableSelect<typeof mediaContentTable>;
export type NewMediaContentRow = TableInsert<typeof mediaContentTable>;

export type MediaVersionRow = TableSelect<typeof mediaVersionsTable>;
export type NewMediaVersionRow = TableInsert<typeof mediaVersionsTable>;
