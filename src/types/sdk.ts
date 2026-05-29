/**
 * SDK types — AstromechClient and the typed-entry narrowing surface.
 *
 * Runtime is `EntriesApi` (api.ts). This file layers literal-type overloads on
 * top so that callers passing string-literal types get a narrowed `TypedEntry`
 * result instead of the wide `Entry`. See specs/typed-entries-api.md §3.2.
 */

import type { Entry, EntryStatus, EntryVersion } from './domain.js';
import type {
    EntriesApi,
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    MediaApi,
    QueryResult,
    SettingsApi,
    UsersApi,
} from './api.js';
import type { ResolvedConfig } from './config.js';

// ============================================================================
// Typed Entry
// ============================================================================

// Open interface — augmented by generated types (.astro/astromech.d.ts)
// Each entry shape: { fields: EntryTypeFields, relations: EntryTypeRelations }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AstromechEntryTypes {}

// Helper types — extract fields/relations from AstromechEntryTypes by key
type FieldsFor<T extends keyof AstromechEntryTypes> =
    AstromechEntryTypes[T] extends { fields: infer F } ? F : never;
type RelationsFor<T extends keyof AstromechEntryTypes> =
    AstromechEntryTypes[T] extends { relations: infer R } ? R : never;

// Typed entry — the Entry type but with typed fields
export type TypedEntry<TFields> = Omit<Entry, 'fields'> & {
    fields: TFields;
};

// ============================================================================
// Typed Entries API
// ============================================================================

/**
 * Layered overloads above the wide `EntriesApi`. Literal-type `type` args
 * return `TypedEntry<FieldsFor<T>>`; the wide overload fallback returns `Entry`.
 */
export type TypedEntriesApi = {
    // ── query ────────────────────────────────────────────────────────────────
    query<T extends keyof AstromechEntryTypes, K extends keyof RelationsFor<T> & string>(
        params: { type: T; populate: K[] } & Omit<EntryQueryParams, 'type' | 'populate'>
    ): Promise<QueryResult<TypedEntry<Omit<FieldsFor<T>, K> & Pick<RelationsFor<T>, K>>>>;
    query<T extends keyof AstromechEntryTypes>(
        params: { type: T } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<FieldsFor<T>>>>;
    query<T extends keyof AstromechEntryTypes>(
        params: { type: readonly T[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<FieldsFor<T>>>>;
    query(
        params: { type: string | readonly string[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<Entry>>;

    // ── get ──────────────────────────────────────────────────────────────────
    get<T extends keyof AstromechEntryTypes, K extends keyof RelationsFor<T> & string>(
        params: { type: T; id: string; populate: K[]; locale?: string }
    ): Promise<TypedEntry<Omit<FieldsFor<T>, K> & Pick<RelationsFor<T>, K>> | null>;
    get<T extends keyof AstromechEntryTypes>(
        params: { type: T; id: string; populate?: string[]; locale?: string }
    ): Promise<TypedEntry<FieldsFor<T>> | null>;
    get(params: {
        type: string;
        id: string;
        populate?: string[];
        locale?: string;
    }): Promise<Entry | null>;

    // ── create ───────────────────────────────────────────────────────────────
    create<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: Partial<FieldsFor<T>>;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    create(params: {
        type: string;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: Record<string, unknown>;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;

    // ── update ───────────────────────────────────────────────────────────────
    update<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<FieldsFor<T>>;
            status: EntryStatus;
            publishAt: Date | null;
        }>;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    update<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: readonly string[];
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<FieldsFor<T>>;
            status: EntryStatus;
            publishAt: Date | null;
        }>;
    }): Promise<TypedEntry<FieldsFor<T>>[]>;
    update(params: { type: string; id: string; data: EntryUpdateData }): Promise<Entry>;
    update(params: {
        type: string;
        id: readonly string[];
        data: EntryUpdateData;
    }): Promise<Entry[]>;

    // ── duplicate ────────────────────────────────────────────────────────────
    duplicate<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
        overrides?: Partial<{
            title: string;
            slug: string;
            locale: string;
            localeGroup: string;
            fields: Partial<FieldsFor<T>>;
            status: EntryStatus;
        }>;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    // ── publish ──────────────────────────────────────────────────────────────
    publish<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    publish<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsFor<T>>[]>;
    publish(params: { type: string; id: string }): Promise<Entry>;
    publish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── unpublish ────────────────────────────────────────────────────────────
    unpublish<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    unpublish<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsFor<T>>[]>;
    unpublish(params: { type: string; id: string }): Promise<Entry>;
    unpublish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── schedule ─────────────────────────────────────────────────────────────
    schedule<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
        publishAt: Date;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    schedule<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: readonly string[];
        publishAt: Date;
    }): Promise<TypedEntry<FieldsFor<T>>[]>;
    schedule(params: { type: string; id: string; publishAt: Date }): Promise<Entry>;
    schedule(params: {
        type: string;
        id: readonly string[];
        publishAt: Date;
    }): Promise<Entry[]>;

    // ── restore ──────────────────────────────────────────────────────────────
    restore<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    restore<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsFor<T>>[]>;
    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── versions / restoreVersion ────────────────────────────────────────────
    versions(params: { type: string; id: string }): Promise<EntryVersion[]>;
    restoreVersion<T extends keyof AstromechEntryTypes>(params: {
        type: T;
        id: string;
        versionId: string;
    }): Promise<TypedEntry<FieldsFor<T>>>;
    restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
    }): Promise<Entry>;
} & Omit<
    EntriesApi,
    | 'query'
    | 'get'
    | 'create'
    | 'update'
    | 'duplicate'
    | 'publish'
    | 'unpublish'
    | 'schedule'
    | 'restore'
    | 'versions'
    | 'restoreVersion'
>;

// ============================================================================
// AstromechClient
// ============================================================================

/**
 * Plugin SDK namespace. Each plugin's access key maps to its set of RPC
 * methods. Strongly-typed per-plugin augmentation is layered on in 18b via
 * generated `declare module` types; the base shape stays loose.
 */
export type PluginSdkNamespace = Record<
    string,
    Record<string, (input?: unknown) => Promise<unknown>>
>;

export type AstromechClient = {
    entries: TypedEntriesApi;
    media: MediaApi;
    settings: SettingsApi;
    users: UsersApi;
    config: ResolvedConfig;
    /** Plugin RPC methods — `Astromech.plugins.<name>.<method>(input)`. */
    plugins?: PluginSdkNamespace;
    configure(options: { baseUrl: string }): void;
};
