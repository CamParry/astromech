import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';
import {
    entriesTable,
    entryPreviewTokensTable,
    entryVersionsTable,
} from '@/entries/tables';
import { mediaTable } from '@/media/tables';
import { notificationsTable } from '@/notifications/tables';
import { settingsTable } from '@/settings/tables';
// `export { x } from '...'` (below) re-exports without binding `x` locally —
// these value imports are ONLY so `CORE_TABLES` (bottom of file) can
// reference the tables; the `export {...} from` blocks stay the public
// re-export surface.
import { rolesTable, usersTable } from '@/users/tables';

/**
 * Aggregate schema surface for Astromech.
 *
 * Re-exports every table's `defineTable` table and row types from its domain
 * module. `sessions`, `accounts` and `verifications` have no descriptor — nothing
 * of ours writes them, so better-auth's adapter owns them outright and they are
 * hand-authored in the app's baseline. `relationships` and `cron` are defined
 * here as they have no dedicated domain module. Consumed by `database/types.ts` (assembles the Kysely
 * `DB`) and `astromech/database/schema`. NOT by `database/codec.ts` — the codec
 * is keyed by `Table`, so every caller passes the one it already holds.
 */

// ============================================================================
// Users / RBAC
// ============================================================================

export {
    rolesTable,
    usersTable,
    type RoleRow,
    type NewRoleRow,
    type UserRow,
} from '@/users/tables';

// ============================================================================
// Entries
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
} from '@/entries/tables';

// ============================================================================
// Media / Settings / Notifications
// ============================================================================

export { mediaTable, type MediaRow, type NewMediaRow } from '@/media/tables';
export { settingsTable, type SettingRow, type NewSettingRow } from '@/settings/tables';
export {
    notificationsTable,
    type NotificationRow,
    type NewNotificationRow,
} from '@/notifications/tables';

// ============================================================================
// Relationships
// ============================================================================

/**
 * The relationships index — DERIVED from field data, never authoritative.
 *
 * Read for exactly three things: reverse lookup, filter-by-relation, and
 * delete-time information. A forward read takes the id out of the field data
 * itself, so a wrong row here is repaired by a rebuild rather than being data
 * loss — which is what makes it safe for the table to be polymorphic.
 *
 * No surrogate id: the natural key IS the row. No `position`, because order
 * lives in field data's array order and a second copy of it would drift. No
 * `createdAt`, because on a row that is rewritten wholesale it would mean "last
 * indexed", not "when the relation was made".
 */
export const relationshipsTable = defineTable(
    'relationships',
    ({ col }) => ({
        sourceId: col.text({ notNull: true }),
        sourceKind: col.enum(['entry', 'user', 'media'], { notNull: true }),
        /** The entry type ('post', 'ns/type'); null for user and media sources. */
        sourceType: col.text(),
        /** `sections[].gallery` — indexed, and what a query matches on. */
        schemaPath: col.text({ notNull: true }),
        /** `sections[a1].gallery` — for deep-linking; never pattern-matched. */
        instancePath: col.text({ notNull: true }),
        targetId: col.text({ notNull: true }),
        targetKind: col.enum(['entry', 'user', 'media'], { notNull: true }),
        /** Derived from the source row's `stagedFor`, so reverse lookup and
         *  filter-by-relation can exclude staged sources without a join. */
        sourceStaged: col.boolean({ notNull: true, default: false }),
    }),
    {
        primaryKey: ['sourceId', 'sourceKind', 'instancePath', 'targetId', 'targetKind'],
        indexes: ({ index }) => [
            index('idx_rel_target', ['targetId', 'targetKind']),
            index('idx_rel_filter', ['sourceType', 'schemaPath', 'targetId']),
        ],
    }
);

export type RelationshipRow = TableSelect<typeof relationshipsTable>;
export type NewRelationshipRow = TableInsert<typeof relationshipsTable>;

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
export const cronTable = defineTable('_astromech_cron', ({ col }) => ({
    name: col.text({ primaryKey: true }),
    schedule: col.text({ notNull: true }),
    enabled: col.boolean({ notNull: true, default: true }),
    lastRun: col.timestamp(),
    nextRun: col.timestamp(),
    lock: col.timestamp(),
}));

export type CronRow = TableSelect<typeof cronTable>;
export type NewCronRow = TableInsert<typeof cronTable>;

// ============================================================================
// Installed-plugin tracking
// ============================================================================

/**
 * One row per plugin present in `config.plugins`, upserted at boot. Its job is
 * to make *removed* plugins visible: a plugin dropped from the config leaves
 * its tables and migration rows behind, and this table is the only record that
 * they were ever ours to clean up (`astromech plugin:purge <package>`).
 *
 * Keyed on `package` — the canonical identifier — with a UNIQUE `namespace`, so
 * two plugins deriving the same namespace collide as a database constraint at
 * migrate time rather than only in the config-resolution check.
 */
export const pluginsTable = defineTable('_astromech_plugins', ({ col }) => ({
    package: col.text({ primaryKey: true }),
    namespace: col.text({ notNull: true, unique: true }),
    version: col.text({ notNull: true }),
    installedAt: col.timestamp({ notNull: true, defaultNow: true }),
}));

export type PluginTrackingRow = TableSelect<typeof pluginsTable>;
export type NewPluginTrackingRow = TableInsert<typeof pluginsTable>;

// ============================================================================
// Core table list — every `defineTable`-backed table we own
// ============================================================================

/**
 * The 11 `defineTable`-backed tables the CMS itself owns, in one place. Consumed
 * by the DDL-parity test, the migration generator and `db:generate` — anywhere
 * that needs "every core table `defineTable` owns" without re-listing the
 * imports by hand. Does NOT include `sessions`/`accounts`/`verifications`
 * (hand-authored in the app baseline — see `codec.ts`) nor any plugin's tables:
 * plugins own their own tables and generate their own migrations via
 * `plugin:generate`.
 */
export const CORE_TABLES: Table[] = [
    rolesTable,
    usersTable,
    entriesTable,
    entryVersionsTable,
    entryPreviewTokensTable,
    mediaTable,
    settingsTable,
    notificationsTable,
    relationshipsTable,
    cronTable,
    pluginsTable,
];
