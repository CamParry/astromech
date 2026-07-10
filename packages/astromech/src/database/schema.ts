/**
 * Aggregate schema surface for Astromech.
 *
 * Re-exports every table's `defineTable` descriptor and row types from its domain
 * module, plus the 4 better-auth Drizzle tables (still seconds-INTEGER, owned by
 * better-auth's adapter). `relationships` and `cron` are defined here as they
 * have no dedicated domain module. Consumed by `database/types.ts` (assembles
 * the Kysely `DB`), `database/codec.ts` (the row codec), and `astromech/db/schema`.
 */

import {
    defineTable,
    type TableDescriptor,
    type TableSelect,
    type TableInsert,
} from '@/database/define-table.js';
// `export { x } from '...'` (below) re-exports without binding `x` locally —
// these value imports are ONLY so `CORE_TABLES` (bottom of file) can
// reference the descriptors; the `export {...} from` blocks stay the public
// re-export surface.
import { roles as rolesTable } from '@/users/schema.js';
import {
    entries as entriesTable,
    entryVersions as entryVersionsTable,
    entryPreviewTokens as entryPreviewTokensTable,
} from '@/entries/schema.js';
import { media as mediaTable } from '@/media/schema.js';
import { settings as settingsTable } from '@/settings/schema.js';
import { notifications as notificationsTable } from '@/notifications/schema.js';

// ============================================================================
// Users / RBAC — roles descriptor (ours) + the 4 better-auth Drizzle tables
// ============================================================================

export {
    roles,
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

export {
    entries,
    entryVersions,
    entryPreviewTokens,
    type EntryRow,
    type NewEntryRow,
    type EntryVersionRow,
    type NewEntryVersionRow,
    type EntryPreviewTokenRow,
    type NewEntryPreviewTokenRow,
} from '@/entries/schema.js';

// ============================================================================
// Media / Settings / Notifications
// ============================================================================

export { media, type MediaRow, type NewMediaRow } from '@/media/schema.js';
export { settings, type SettingRow, type NewSettingRow } from '@/settings/schema.js';
export {
    notifications,
    type NotificationRow,
    type NewNotificationRow,
} from '@/notifications/schema.js';

// ============================================================================
// Relationships
// ============================================================================

export const relationships = defineTable(
    'relationships',
    ({ col }) => ({
        id: col.id(),
        sourceId: col.text({ notNull: true }),
        sourceType: col.enum(['entry', 'user', 'media'], { notNull: true }),
        name: col.text({ notNull: true }),
        targetId: col.text({ notNull: true }),
        targetType: col.enum(['entry', 'user', 'media'], { notNull: true }),
        position: col.integer({ notNull: true, default: 0 }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    }),
    ({ index }) => [
        index('idx_rel_source', ['sourceId', 'sourceType', 'name']),
        index('idx_rel_target', ['targetId', 'targetType']),
    ]
);

export type RelationshipRow = TableSelect<typeof relationships>;
export type NewRelationshipRow = TableInsert<typeof relationships>;

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
export const cron = defineTable('_astromech_cron', ({ col }) => ({
    name: col.text({ primaryKey: true }),
    schedule: col.text({ notNull: true }),
    enabled: col.boolean({ notNull: true, default: true }),
    lastRun: col.timestamp(),
    nextRun: col.timestamp(),
    lock: col.timestamp(),
}));

export type CronRow = TableSelect<typeof cron>;
export type NewCronRow = TableInsert<typeof cron>;

// ============================================================================
// Core descriptor list — every `defineTable`-backed table we own
// ============================================================================

/**
 * The 9 descriptor-backed tables, in one place. Consumed by the DDL-parity
 * test, the migration generator (`generator.ts`), and `db:generate`'s CLI
 * repoint — anywhere that needs "every table `defineTable` owns" without
 * re-listing the 9 imports by hand. Does NOT include the 4 better-auth tables
 * or the 2 plugin tables (they have no descriptor — see `codec.ts`).
 */
export const CORE_TABLES: TableDescriptor[] = [
    rolesTable,
    entriesTable,
    entryVersionsTable,
    entryPreviewTokensTable,
    mediaTable,
    settingsTable,
    notificationsTable,
    relationships,
    cron,
];
