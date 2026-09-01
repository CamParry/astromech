/**
 * The entries tables — source of truth for row types and the codec. `entries`
 * is the resource row, `entry_content` holds one row per locale of what editors
 * author, and `entry_versions` snapshots a content row.
 */

import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

export const entriesTable = defineTable(
    'entries',
    ({ col }) => ({
        id: col.id(),
        type: col.text({ notNull: true }),
        // SHA-256 hash of the entry's preview secret; the plaintext is shown
        // once at issue. One token per entry, authorizing every locale.
        previewToken: col.text({ unique: true }),
        previewTokenExpiresAt: col.timestamp(),
        deletedAt: col.timestamp(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_entries_type', ['type']),
        index('idx_entries_deleted', ['deletedAt']),
    ]
);

export const entryContentTable = defineTable(
    'entry_content',
    ({ col }) => ({
        id: col.id(),
        entryId: col.reference(() => entriesTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        // Copied from `entries.type`: the slug-unique and list indexes below
        // cannot reach across the join.
        type: col.text({ notNull: true }),
        locale: col.text({ notNull: true }),
        title: col.text({ notNull: true }),
        slug: col.text(),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled'], {
            notNull: true,
            default: 'unpublished',
        }),
        publishedAt: col.timestamp(),
        // Self-reference (forward versioning): non-null marks this row as the
        // staged change of the canonical content row it names. Annotated thunk
        // breaks the circular inference, mirroring drizzle's AnySQLiteColumn.
        stagedFor: col.reference((): Table => entryContentTable, {
            onDelete: 'no action',
        }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_entry_content_entry', ['entryId']),
        index('idx_entry_content_locale', ['type', 'locale', 'status']),
        index('idx_entry_content_staged_for', ['stagedFor']),
        index('entry_content_entry_locale_unique', ['entryId', 'locale'], {
            unique: true,
            where: 'staged_for IS NULL',
        }),
        index('entry_content_type_locale_slug_unique', ['type', 'locale', 'slug'], {
            unique: true,
            where: 'staged_for IS NULL',
        }),
    ]
);

export const entryVersionsTable = defineTable(
    'entry_versions',
    ({ col }) => ({
        id: col.id(),
        contentId: col.reference(() => entryContentTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        version: col.integer({ notNull: true }),
        title: col.text({ notNull: true }),
        slug: col.text(),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled']),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [index('idx_entry_versions_content', ['contentId', 'version'])]
);

export type EntryRow = TableSelect<typeof entriesTable>;
export type NewEntryRow = TableInsert<typeof entriesTable>;

export type EntryContentRow = TableSelect<typeof entryContentTable>;
export type NewEntryContentRow = TableInsert<typeof entryContentTable>;

export type EntryVersionRow = TableSelect<typeof entryVersionsTable>;
export type NewEntryVersionRow = TableInsert<typeof entryVersionsTable>;
