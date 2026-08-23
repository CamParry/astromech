/**
 * The Kysely `DB` interface — the storage-shaped type surface for the query
 * layer. Core tables are derived from their `defineTable` objects via
 * `KyselyOf<>`; `sessions`/`accounts`/`verifications` stay hand-typed.
 */

import type { KyselyOf } from '@/database/define-table';
// Every table comes through the `database/schema.ts` aggregator rather than
// from each domain directly, keeping `database/` below the domains in the
// dependency graph (see the `database-no-upward-except-aggregate` rule).
import type {
    cronTable,
    entriesTable,
    entryPreviewTokensTable,
    entryVersionsTable,
    mediaTable,
    notificationsTable,
    pluginsTable,
    relationshipsTable,
    rolesTable,
    settingsTable,
    usersTable,
} from '@/database/tables';
import type { Kysely, Transaction } from 'kysely';

export type DB = {
    // Ours — derived from defineTable tables
    roles: KyselyOf<typeof rolesTable>;
    users: KyselyOf<typeof usersTable>;
    entries: KyselyOf<typeof entriesTable>;
    entryVersions: KyselyOf<typeof entryVersionsTable>;
    entryPreviewTokens: KyselyOf<typeof entryPreviewTokensTable>;
    media: KyselyOf<typeof mediaTable>;
    settings: KyselyOf<typeof settingsTable>;
    notifications: KyselyOf<typeof notificationsTable>;
    relationships: KyselyOf<typeof relationshipsTable>;
    // Leading-underscore table name has no camelCase humps, so CamelCasePlugin
    // leaves it intact; keep the key identical to the SQL table name.
    _astromech_cron: KyselyOf<typeof cronTable>;
    _astromech_plugins: KyselyOf<typeof pluginsTable>;

    // better-auth — hand-typed
    sessions: SessionsTable;
    accounts: AccountsTable;
    verifications: VerificationsTable;
};

/** The shared DB handle accepted by every repository factory (base or tx-bound). */
export type Db = Kysely<DB> | Transaction<DB>;

type SessionsTable = {
    id: string; // PK (supplied by better-auth)
    expiresAt: string;
    token: string; // unique
    createdAt: string;
    updatedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    userId: string; // FK users.id ON DELETE CASCADE
};

type AccountsTable = {
    id: string; // PK
    accountId: string;
    providerId: string;
    userId: string; // FK users.id ON DELETE CASCADE
    accessToken: string | null;
    refreshToken: string | null;
    idToken: string | null;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    scope: string | null;
    password: string | null;
    createdAt: string;
    updatedAt: string;
};

type VerificationsTable = {
    id: string; // PK
    identifier: string;
    value: string;
    expiresAt: string;
    createdAt: string | null;
    updatedAt: string | null;
};
