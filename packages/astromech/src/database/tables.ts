import type { Table, TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';
import { entriesTable, entryContentTable, entryVersionsTable } from '@/entries/tables';
import { mediaTable } from '@/media/tables';
import { notificationsTable } from '@/notifications/tables';
import { settingsTable } from '@/settings/tables';
// `export { x } from '...'` (below) re-exports without binding `x` locally —
// these value imports are ONLY so `CORE_TABLES` (bottom of file) can
// reference the tables; the `export {...} from` blocks stay the public
// re-export surface.
import { rolesTable, usersTable } from '@/users/tables';

/**
 * Aggregate schema surface for Astromech — re-exports every table's
 * `defineTable` descriptor and row types. `sessions`/`accounts`/`verifications`
 * have no descriptor here; better-auth's adapter owns them via the app baseline.
 */

export {
    rolesTable,
    usersTable,
    type RoleRow,
    type NewRoleRow,
    type UserRow,
} from '@/users/tables';

export {
    entriesTable,
    entryContentTable,
    entryVersionsTable,
    type EntryRow,
    type NewEntryRow,
    type EntryContentRow,
    type NewEntryContentRow,
    type EntryVersionRow,
    type NewEntryVersionRow,
} from '@/entries/tables';

export { mediaTable, type MediaRow, type NewMediaRow } from '@/media/tables';
export { settingsTable, type SettingRow, type NewSettingRow } from '@/settings/tables';
export {
    notificationsTable,
    type NotificationRow,
    type NewNotificationRow,
} from '@/notifications/tables';

/**
 * The relationships index — DERIVED from field data, never authoritative. Used
 * for reverse lookup, filter-by-relation, and delete-time info. No surrogate
 * id: the natural key IS the row, so a rebuild repairs a wrong row safely.
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

/**
 * Scheduler state — single source of truth for cron cadence and the
 * multi-instance lock, seeded from jobs' default `schedule` on first tick.
 * `lock` is a claim-EXPIRY timestamp; a crashed claim auto-expires for retry.
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

/**
 * One row per plugin present in `config.plugins`, upserted at boot. Makes
 * *removed* plugins visible for `astromech plugin:purge`. Keyed on `package`,
 * with a UNIQUE `namespace` so colliding namespaces fail as a DB constraint.
 */
export const pluginsTable = defineTable('_astromech_plugins', ({ col }) => ({
    package: col.text({ primaryKey: true }),
    namespace: col.text({ notNull: true, unique: true }),
    version: col.text({ notNull: true }),
    installedAt: col.timestamp({ notNull: true, defaultNow: true }),
}));

export type PluginTrackingRow = TableSelect<typeof pluginsTable>;
export type NewPluginTrackingRow = TableInsert<typeof pluginsTable>;

/**
 * The `defineTable`-backed tables the CMS itself owns, in one place — consumed
 * by the DDL-parity test, the migration generator and `db:generate`. Excludes
 * `sessions`/`accounts`/`verifications` (hand-authored) and plugin tables.
 */
export const CORE_TABLES: Table[] = [
    rolesTable,
    usersTable,
    entriesTable,
    entryContentTable,
    entryVersionsTable,
    mediaTable,
    settingsTable,
    notificationsTable,
    relationshipsTable,
    cronTable,
    pluginsTable,
];
