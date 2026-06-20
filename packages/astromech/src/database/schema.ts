/**
 * Drizzle ORM Schema for Astromech CMS
 *
 * Compatible with Cloudflare D1 (SQLite)
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

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
// Entries (tables moved to @/entries/schema.ts — re-exported for aggregate surface)
// ============================================================================

export {
    entriesTable,
    entryVersionsTable,
    entryPreviewTokensTable,
    type EntryRow,
    type NewEntryRow,
    type EntryVersionRow,
    type NewEntryVersionRow,
    type EntryPreviewTokenRow,
    type NewEntryPreviewTokenRow,
} from '@/entries/schema.js';

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
// Notifications (table moved to @/notifications/schema.ts — re-exported for aggregate surface)
// ============================================================================

export {
    notificationsTable,
    type NotificationRow,
    type NewNotificationRow,
} from '@/notifications/schema.js';

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

export type RelationshipRow = typeof relationshipsTable.$inferSelect;
export type NewRelationshipRow = typeof relationshipsTable.$inferInsert;
