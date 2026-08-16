/**
 * The Kysely `DB` interface — the storage-shaped type surface for the query layer.
 *
 * The 11 tables we own are derived from their `defineTable` objects via
 * `KyselyOf<>`: timestamps are ISO-8601 **TEXT** (`string`) unless the column
 * declares `storage: 'seconds'` (`number`, which `users` does — better-auth's
 * adapter writes it), JSON columns are `string`, booleans are `number` (0/1), and
 * `Generated<>` marks any column an app/SQL default fills. These are the *storage*
 * shapes Kysely sees before the row codec turns them into the rich domain Row
 * types (`EntryRow`, …), so storage methods keep returning identical shapes to
 * their callers.
 *
 * `sessions`, `accounts` and `verifications` stay **hand-typed** in their
 * seconds-INTEGER format: nothing of ours writes them, so they have no
 * descriptor and keep the codec's name-keyed seconds/json/bool handling (see
 * `codec.ts`).
 *
 * Keys are **camelCase**; the active Kysely instance runs `CamelCasePlugin`, so
 * these map to snake_case DDL columns automatically (result rows come back
 * camelCase).
 */

import type { Kysely, Transaction } from 'kysely';
import type { KyselyOf } from '@/database/define-table';
// Every table comes through the `database/schema.ts` aggregator rather than
// from each domain directly — that indirection is the whole reason the
// aggregator exists, and it keeps the rest of `database/` below the domains in
// the dependency graph (see the `database-no-upward-except-aggregate` rule).
import type {
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
} from '@/database/schema';

export type DB = {
    // ── 11 ours — derived from defineTable tables ───────────────────────────
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

    // ── 3 better-auth — hand-typed, seconds-INTEGER ─────────────────────────
    sessions: SessionsTable;
    accounts: AccountsTable;
    verifications: VerificationsTable;
};

/** The shared DB handle accepted by every storage factory (base or tx-bound). */
export type Db = Kysely<DB> | Transaction<DB>;

type SessionsTable = {
    id: string; // PK (supplied by better-auth)
    expiresAt: number;
    token: string; // unique
    createdAt: number;
    updatedAt: number;
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
    accessTokenExpiresAt: number | null;
    refreshTokenExpiresAt: number | null;
    scope: string | null;
    password: string | null;
    createdAt: number;
    updatedAt: number;
};

type VerificationsTable = {
    id: string; // PK
    identifier: string;
    value: string;
    expiresAt: number;
    createdAt: number | null;
    updatedAt: number | null;
};
