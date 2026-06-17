/**
 * Drizzle ORM Schema for Astromech CMS
 *
 * Compatible with Cloudflare D1 (SQLite)
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { usersTable } from '@/users/schema.js';

// ============================================================================
// Users domain tables (moved to @/users/schema.ts — re-exported for aggregate surface)
// ============================================================================

export {
    rolesTable,
    usersTable,
    sessionsTable,
    accountsTable,
    verificationsTable,
    type RoleRow,
    type NewRoleRow,
    type UserRow,
    type NewUserRow,
    type SessionRow,
    type NewSessionRow,
    type AccountRow,
    type NewAccountRow,
    type VerificationRow,
    type NewVerificationRow,
} from '@/users/schema.js';

// ============================================================================
// Entries
// ============================================================================

export const entriesTable = sqliteTable(
    'entries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        type: text('type').notNull(),
        locale: text('locale').notNull(),
        // Synthetic group identifier shared by all rows that represent the same
        // content across locales. Generated via crypto.randomUUID() on create.
        localeGroup: text('locale_group')
            .notNull()
            .$defaultFn(() => crypto.randomUUID()),

        slug: text('slug'),
        title: text('title').notNull(),
        fields: text('fields', { mode: 'json' }),
        status: text('status', { enum: ['draft', 'published', 'scheduled'] })
            .notNull()
            .default('draft'),
        publishedAt: integer('published_at', { mode: 'timestamp' }),
        deletedAt: integer('deleted_at', { mode: 'timestamp' }),

        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
        updatedBy: text('updated_by').references(() => usersTable.id),
    },
    (table) => [
        index('idx_entries_type').on(table.type),
        index('idx_entries_status').on(table.type, table.status),
        index('idx_entries_locale').on(table.type, table.locale, table.status),
        index('idx_entries_deleted').on(table.deletedAt),
        index('idx_entries_locale_group').on(table.localeGroup),
        uniqueIndex('entries_locale_group_locale_unique').on(
            table.localeGroup,
            table.locale
        ),
        uniqueIndex('entries_type_locale_slug_unique').on(
            table.type,
            table.locale,
            table.slug
        ),
    ]
);

// ============================================================================
// Entry Versions
// ============================================================================

export const entryVersionsTable = sqliteTable(
    'entry_versions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        entryId: text('entry_id')
            .notNull()
            .references(() => entriesTable.id, { onDelete: 'cascade' }),
        versionNumber: integer('version_number').notNull(),
        title: text('title').notNull(),
        slug: text('slug'),
        fields: text('fields', { mode: 'json' }),
        relations: text('relations', { mode: 'json' }).$type<
            Record<string, string | string[]>
        >(),
        status: text('status', { enum: ['draft', 'published', 'scheduled'] }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
    },
    (table) => [index('idx_versions_entry').on(table.entryId, table.versionNumber)]
);

// ============================================================================
// Relationships
// ============================================================================

export const relationshipsTable = sqliteTable(
    'relationships',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        sourceId: text('source_id').notNull(),
        sourceType: text('source_type', {
            enum: ['entry', 'user', 'media'],
        }).notNull(),
        name: text('name').notNull(),
        targetId: text('target_id').notNull(),
        targetType: text('target_type', {
            enum: ['entry', 'user', 'media'],
        }).notNull(),
        position: integer('position').notNull().default(0),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => ({
        sourceIdx: index('idx_rel_source').on(
            table.sourceId,
            table.sourceType,
            table.name
        ),
        targetIdx: index('idx_rel_target').on(table.targetId, table.targetType),
    })
);

// ============================================================================
// Media (table moved to @/media/schema.ts — re-exported for aggregate surface)
// ============================================================================

export { mediaTable, type MediaRow, type NewMediaRow } from '@/media/schema.js';

// ============================================================================
// Settings (table moved to @/settings/schema.ts — re-exported for aggregate surface)
// ============================================================================

export { settingsTable, type SettingRow, type NewSettingRow } from '@/settings/schema.js';

// ============================================================================
// Cron
// ============================================================================

/**
 * Scheduler state — the single source of truth for cron cadence and the
 * multi-instance lock. Seeded from registered jobs' default `schedule` on first
 * tick; the stored row is authoritative thereafter (runtime-editable).
 *
 * `lock` is a claim-EXPIRY timestamp that doubles as the claim token: a tick
 * CAS-claims a job by writing an expiry; a crashed claim auto-expires so the
 * next tick can retry.
 */
export const cronTable = sqliteTable('_astromech_cron', {
    name: text('name').primaryKey(),
    schedule: text('schedule').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRun: integer('last_run', { mode: 'timestamp' }),
    nextRun: integer('next_run', { mode: 'timestamp' }),
    lock: integer('lock', { mode: 'timestamp' }),
});

export type CronRow = typeof cronTable.$inferSelect;
export type NewCronRow = typeof cronTable.$inferInsert;

// ============================================================================
// Type Exports
// ============================================================================

export type EntryRow = typeof entriesTable.$inferSelect;
export type NewEntryRow = typeof entriesTable.$inferInsert;

export type EntryVersionRow = typeof entryVersionsTable.$inferSelect;
export type NewEntryVersionRow = typeof entryVersionsTable.$inferInsert;

export type RelationshipRow = typeof relationshipsTable.$inferSelect;
export type NewRelationshipRow = typeof relationshipsTable.$inferInsert;
