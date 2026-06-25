/**
 * Hand-written Kysely `DB` interface — the type surface for the query layer.
 *
 * Columns are typed in **raw storage types** (what libsql returns *before* the
 * row codec runs): timestamps are unix-**seconds** `number` (drizzle's
 * `{ mode: 'timestamp' }` on-disk format — see `codec.ts`), JSON columns are
 * `string`, booleans are `number` (0/1). The codec (`decode`) turns these into
 * the rich domain shapes (`Date`, parsed object, `boolean`) that the domain Row
 * types (`UserRow`, `EntryRow`, … — still derived from the drizzle tables) carry,
 * so storage methods keep returning identical shapes to their callers.
 *
 * Keys are **camelCase**; the active Kysely instance runs `CamelCasePlugin`, so
 * these map to the snake_case DDL columns automatically (and result rows come
 * back camelCase). This file is throwaway — step 2 derives `DB` from descriptors.
 *
 * `Generated<T>` marks a column omittable on insert, for one of two reasons:
 *   (SQL) a SQL `DEFAULT` in the DDL fills it, or
 *   (APP) the codec's `appDefaults` fills it (id/createdAt/updatedAt/localeGroup).
 */

import type {
    Generated,
    Insertable,
    Selectable,
    Updateable,
    Kysely,
    Transaction,
} from 'kysely';

export type DB = {
    roles: RolesTable;
    users: UsersTable;
    sessions: SessionsTable;
    accounts: AccountsTable;
    verifications: VerificationsTable;
    entries: EntriesTable;
    entryVersions: EntryVersionsTable;
    entryPreviewTokens: EntryPreviewTokensTable;
    media: MediaTable;
    settings: SettingsTable;
    notifications: NotificationsTable;
    relationships: RelationshipsTable;
    // Leading-underscore table name has no camelCase humps, so CamelCasePlugin
    // leaves it intact; keep the key identical to the SQL table name.
    _astromech_cron: CronTable;
};

/** The shared DB handle accepted by every storage factory (base or tx-bound). */
export type Db = Kysely<DB> | Transaction<DB>;

type RolesTable = {
    slug: string; // PK
    name: string;
    permissions: string; // json (string[])
    isBuiltIn: Generated<number>; // SQL default 0
    createdAt: Generated<number>; // APP default now (seconds)
    updatedAt: Generated<number>; // APP default now (seconds)
};

type UsersTable = {
    id: Generated<string>; // APP default uuid
    email: string; // unique
    name: string;
    emailVerified: Generated<number>; // SQL default 0
    image: string | null;
    fields: string | null; // json
    roleSlug: Generated<string>; // SQL default 'admin'
    createdAt: Generated<number>; // APP now
    updatedAt: Generated<number>; // APP now
};

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

type EntriesTable = {
    id: Generated<string>; // APP uuid
    type: string;
    locale: string;
    localeGroup: Generated<string>; // APP uuid
    slug: string | null;
    title: string;
    fields: string | null; // json
    status: Generated<'unpublished' | 'published' | 'scheduled'>; // SQL default 'unpublished'
    stagedFor: string | null; // FK entries.id ON DELETE CASCADE
    publishedAt: number | null;
    deletedAt: number | null;
    createdAt: Generated<number>; // APP now
    updatedAt: Generated<number>; // APP now
    createdBy: string | null; // FK users.id
    updatedBy: string | null; // FK users.id
};

type EntryVersionsTable = {
    id: Generated<string>; // APP uuid
    entryId: string; // FK entries.id ON DELETE CASCADE
    versionNumber: number;
    title: string;
    slug: string | null;
    fields: string | null; // json
    relations: string | null; // json
    status: 'unpublished' | 'published' | 'scheduled' | null;
    createdAt: Generated<number>; // APP now
    createdBy: string | null; // FK users.id
};

type EntryPreviewTokensTable = {
    id: Generated<string>; // APP uuid
    entryId: string; // FK entries.id ON DELETE CASCADE
    token: string; // unique
    expiresAt: number | null;
    createdAt: Generated<number>; // APP now
    createdBy: string | null; // FK users.id
};

type MediaTable = {
    id: Generated<string>; // APP uuid
    filename: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    alt: string | null;
    fields: string | null; // json
    metadata: string | null; // json
    createdAt: Generated<number>; // APP now
    updatedAt: Generated<number>; // APP now
    createdBy: string | null; // FK users.id
};

type SettingsTable = {
    key: string; // PK
    value: string | null; // json
    updatedAt: Generated<number>; // APP now
    updatedBy: string | null; // FK users.id
};

type NotificationsTable = {
    id: Generated<string>; // APP uuid
    userId: string; // FK users.id ON DELETE CASCADE
    type: string;
    title: string;
    message: string;
    href: string | null;
    createdAt: Generated<number>; // APP now
};

type RelationshipsTable = {
    id: Generated<string>; // APP uuid
    sourceId: string;
    sourceType: 'entry' | 'user' | 'media';
    name: string;
    targetId: string;
    targetType: 'entry' | 'user' | 'media';
    position: Generated<number>; // SQL default 0
    createdAt: Generated<number>; // APP now
};

type CronTable = {
    name: string; // PK
    schedule: string;
    enabled: Generated<number>; // SQL default 1
    lastRun: number | null;
    nextRun: number | null;
    lock: number | null;
};

// Internal raw-row helpers for the Kysely query layer (NOT the domain Row types,
// which keep their drizzle-derived Date/object/boolean shapes).
export type RawRole = Selectable<RolesTable>;
export type RawUser = Selectable<UsersTable>;
export type RawSession = Selectable<SessionsTable>;
export type RawAccount = Selectable<AccountsTable>;
export type RawVerification = Selectable<VerificationsTable>;
export type RawEntry = Selectable<EntriesTable>;
export type NewRawEntry = Insertable<EntriesTable>;
export type EntryUpdate = Updateable<EntriesTable>;
export type RawEntryVersion = Selectable<EntryVersionsTable>;
export type RawEntryPreviewToken = Selectable<EntryPreviewTokensTable>;
export type RawMedia = Selectable<MediaTable>;
export type RawSetting = Selectable<SettingsTable>;
export type RawNotification = Selectable<NotificationsTable>;
export type RawRelationship = Selectable<RelationshipsTable>;
export type RawCron = Selectable<CronTable>;
