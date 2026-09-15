/**
 * The Kysely `DB` interface — the encoded-shaped type surface for the query
 * layer. Every core table is derived from its `defineTable` object via
 * `KyselyOf<>`.
 */

import type { KyselyOf } from '@/database/define-table';
// Every table comes through the `database/schema.ts` aggregator rather than
// from each domain directly, keeping `database/` below the domains in the
// dependency graph (see the `database-no-upward-except-aggregate` rule).
import type {
    accountsTable,
    cronTable,
    entriesTable,
    entryContentTable,
    entryVersionsTable,
    globalContentTable,
    globalsTable,
    globalVersionsTable,
    mediaContentTable,
    mediaTable,
    mediaVersionsTable,
    notificationsTable,
    pluginsTable,
    relationshipsTable,
    rolesTable,
    sessionsTable,
    settingsTable,
    userContentTable,
    usersTable,
    userVersionsTable,
    verificationsTable,
} from '@/database/tables';
import type { Kysely, Transaction } from 'kysely';

/**
 * Plugin tables on the shared handle, empty in core. A plugin package adds its
 * own tables from its own source, so a site's `db` is typed with them without
 * naming them:
 *
 * ```ts
 * const tables = [widgetsTable] as const;
 *
 * declare module 'astromech' {
 *     interface AstromechPluginTables extends PluginDB<typeof tables> {}
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginTables {}

/**
 * Core's tables plus every plugin's. An interface extending
 * `AstromechPluginTables` rather than an intersection with it: augmentations
 * reach it either way, but an interface stays one named type, so Kysely's
 * errors and hovers print `DB` instead of spelling out every table.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface DB extends AstromechPluginTables {
    // Ours — derived from defineTable tables
    roles: KyselyOf<typeof rolesTable>;
    users: KyselyOf<typeof usersTable>;
    userContent: KyselyOf<typeof userContentTable>;
    userVersions: KyselyOf<typeof userVersionsTable>;
    entries: KyselyOf<typeof entriesTable>;
    entryContent: KyselyOf<typeof entryContentTable>;
    entryVersions: KyselyOf<typeof entryVersionsTable>;
    globals: KyselyOf<typeof globalsTable>;
    globalContent: KyselyOf<typeof globalContentTable>;
    globalVersions: KyselyOf<typeof globalVersionsTable>;
    media: KyselyOf<typeof mediaTable>;
    mediaContent: KyselyOf<typeof mediaContentTable>;
    mediaVersions: KyselyOf<typeof mediaVersionsTable>;
    settings: KyselyOf<typeof settingsTable>;
    notifications: KyselyOf<typeof notificationsTable>;
    relationships: KyselyOf<typeof relationshipsTable>;
    // Leading-underscore table name has no camelCase humps, so CamelCasePlugin
    // leaves it intact; keep the key identical to the SQL table name.
    _astromech_cron: KyselyOf<typeof cronTable>;
    _astromech_plugins: KyselyOf<typeof pluginsTable>;

    // better-auth's, written through its own Kysely instance
    sessions: KyselyOf<typeof sessionsTable>;
    accounts: KyselyOf<typeof accountsTable>;
    verifications: KyselyOf<typeof verificationsTable>;
}

/** The shared DB handle accepted by every repository factory (base or tx-bound). */
export type Db = Kysely<DB> | Transaction<DB>;
