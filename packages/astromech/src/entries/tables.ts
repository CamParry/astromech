/**
 * The entries tables — source of truth for row types and the codec. A preview
 * token is a per-canonical-entry secret authorizing front-end preview of
 * non-published content; one per entry, and only its hash is stored.
 */

import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

export const entriesTable = defineTable(
    'entries',
    ({ col }) => ({
        id: col.id(),
        type: col.text({ notNull: true }),
        locale: col.text({ notNull: true }),
        // Opaque cross-locale grouping key; app-generated ULID default.
        localeGroup: col.text({ notNull: true, defaultUlid: true }),
        slug: col.text(),
        title: col.text({ notNull: true }),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled'], {
            notNull: true,
            default: 'unpublished',
        }),
        // Self-reference (forward versioning). Annotated thunk breaks the
        // circular inference, mirroring drizzle's AnySQLiteColumn pattern.
        stagedFor: col.reference((): Table => entriesTable, {
            onDelete: 'no action',
        }),
        publishedAt: col.timestamp(),
        deletedAt: col.timestamp(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users'),
        updatedBy: col.reference('users'),
    }),
    ({ index }) => [
        index('idx_entries_type', ['type']),
        index('idx_entries_status', ['type', 'status']),
        index('idx_entries_locale', ['type', 'locale', 'status']),
        index('idx_entries_deleted', ['deletedAt']),
        index('idx_entries_locale_group', ['localeGroup']),
        index('idx_entries_staged_for', ['stagedFor']),
        index('entries_locale_group_locale_unique', ['localeGroup', 'locale'], {
            unique: true,
        }),
        index('entries_type_locale_slug_unique', ['type', 'locale', 'slug'], {
            unique: true,
            where: 'staged_for IS NULL',
        }),
    ]
);

export const entryVersionsTable = defineTable(
    'entry_versions',
    ({ col }) => ({
        id: col.id(),
        entryId: col.reference(() => entriesTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        versionNumber: col.integer({ notNull: true }),
        title: col.text({ notNull: true }),
        slug: col.text(),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled']),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users'),
    }),
    ({ index }) => [index('idx_versions_entry', ['entryId', 'versionNumber'])]
);

export const entryPreviewTokensTable = defineTable('entry_preview_tokens', ({ col }) => ({
    id: col.id(),
    entryId: col.reference(() => entriesTable, { notNull: true, onDelete: 'cascade' }),
    token: col.text({ notNull: true, unique: true }),
    expiresAt: col.timestamp(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    createdBy: col.reference('users'),
}));

export type EntryRow = TableSelect<typeof entriesTable>;
export type NewEntryRow = TableInsert<typeof entriesTable>;

export type EntryVersionRow = TableSelect<typeof entryVersionsTable>;
export type NewEntryVersionRow = TableInsert<typeof entryVersionsTable>;

export type EntryPreviewTokenRow = TableSelect<typeof entryPreviewTokensTable>;
export type NewEntryPreviewTokenRow = TableInsert<typeof entryPreviewTokensTable>;
