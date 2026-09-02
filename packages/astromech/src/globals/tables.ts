/**
 * The globals tables — source of truth for row types and the codec. `globals`
 * is the resource row, one per declared global, `global_content` holds one row
 * per locale of what editors author, and `global_versions` snapshots a content
 * row. The same three-table shape as entries, without slug or trash.
 */

import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

export const globalsTable = defineTable('globals', ({ col }) => ({
    id: col.id(),
    // The config identity of the global: `site`, or `<namespace>/<key>` for
    // a plugin's. "Exactly one row per global" is this unique constraint.
    key: col.text({ notNull: true, unique: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
    createdBy: col.reference('users', { onDelete: 'set null' }),
    updatedBy: col.reference('users', { onDelete: 'set null' }),
}));

export const globalContentTable = defineTable(
    'global_content',
    ({ col }) => ({
        id: col.id(),
        globalId: col.reference(() => globalsTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        locale: col.text({ notNull: true }),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled'], {
            notNull: true,
            default: 'unpublished',
        }),
        publishedAt: col.timestamp(),
        // Self-reference (forward versioning): non-null marks this row as the
        // staged change of the canonical content row it names. Annotated thunk
        // breaks the circular inference, mirroring drizzle's AnySQLiteColumn.
        stagedFor: col.reference((): Table => globalContentTable, {
            onDelete: 'no action',
        }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_global_content_global', ['globalId']),
        index('idx_global_content_staged_for', ['stagedFor']),
        index('global_content_global_locale_unique', ['globalId', 'locale'], {
            unique: true,
            where: 'staged_for IS NULL',
        }),
    ]
);

export const globalVersionsTable = defineTable(
    'global_versions',
    ({ col }) => ({
        id: col.id(),
        contentId: col.reference(() => globalContentTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        version: col.integer({ notNull: true }),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled']),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [index('idx_global_versions_content', ['contentId', 'version'])]
);

export type GlobalRow = TableSelect<typeof globalsTable>;
export type NewGlobalRow = TableInsert<typeof globalsTable>;

export type GlobalContentRow = TableSelect<typeof globalContentTable>;
export type NewGlobalContentRow = TableInsert<typeof globalContentTable>;

export type GlobalVersionRow = TableSelect<typeof globalVersionsTable>;
export type NewGlobalVersionRow = TableInsert<typeof globalVersionsTable>;
