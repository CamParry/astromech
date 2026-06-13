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
import type { PluginSdkMethod } from './plugins.js';

// ============================================================================
// Typed Entry
// ============================================================================

// Open interface — augmented by generated types (.astro/astromech.d.ts)
// Each entry shape: { fields: EntryTypeFields, relations: EntryTypeRelations }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechEntryTypes {}

// Generic helpers — extract fields/relations from any entry-type map by key
type FieldsForMap<Map, T extends keyof Map> = Map[T] extends { fields: infer F }
    ? F
    : never;
type RelationsForMap<Map, T extends keyof Map> = Map[T] extends { relations: infer R }
    ? R
    : never;

// Typed entry — the Entry type but with typed fields
export type TypedEntry<TFields> = Omit<Entry, 'fields'> & {
    fields: TFields;
};

// ============================================================================
// Typed Entries API
// ============================================================================

/**
 * Layered overloads above the wide `EntriesApi`, parameterised by an entry-type
 * map. Literal-type `type` args return `TypedEntry<FieldsFor<T>>`; the wide
 * overload fallback returns `Entry`.
 *
 * `TypedEntriesApi` is the standard alias bound to the global
 * `AstromechEntryTypes`; plugin entry APIs are typed via
 * `TypedEntriesApiFor<AstromechPluginEntryTypes[Name]>`.
 */
export type TypedEntriesApiFor<EntryMap> = {
    // ── query ────────────────────────────────────────────────────────────────
    query<
        T extends keyof EntryMap,
        K extends keyof RelationsForMap<EntryMap, T> & string,
    >(
        params: { type: T; populate: K[] } & Omit<EntryQueryParams, 'type' | 'populate'>
    ): Promise<
        QueryResult<
            TypedEntry<
                Omit<FieldsForMap<EntryMap, T>, K> & Pick<RelationsForMap<EntryMap, T>, K>
            >
        >
    >;
    query<T extends keyof EntryMap>(
        params: { type: T } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<FieldsForMap<EntryMap, T>>>>;
    // Deliberately separate from the single-type overload: a union parameter
    // would degrade inference of T at call sites.
    /* eslint-disable @typescript-eslint/unified-signatures */
    query<T extends keyof EntryMap>(
        params: { type: readonly T[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<FieldsForMap<EntryMap, T>>>>;
    /* eslint-enable @typescript-eslint/unified-signatures */
    query(
        params: { type: string | readonly string[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<Entry>>;

    // ── get ──────────────────────────────────────────────────────────────────
    get<
        T extends keyof EntryMap,
        K extends keyof RelationsForMap<EntryMap, T> & string,
    >(params: {
        type: T;
        id: string;
        populate: K[];
        locale?: string;
    }): Promise<TypedEntry<
        Omit<FieldsForMap<EntryMap, T>, K> & Pick<RelationsForMap<EntryMap, T>, K>
    > | null>;
    get<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        populate?: string[];
        locale?: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>> | null>;
    get(params: {
        type: string;
        id: string;
        populate?: string[];
        locale?: string;
    }): Promise<Entry | null>;

    // ── create ───────────────────────────────────────────────────────────────
    create<T extends keyof EntryMap>(params: {
        type: T;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: Partial<FieldsForMap<EntryMap, T>>;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    create(params: {
        type: string;
        /** Optional for `titleField: false` types; runtime-enforced otherwise. */
        title?: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: Record<string, unknown>;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;

    // ── update ───────────────────────────────────────────────────────────────
    update<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<FieldsForMap<EntryMap, T>>;
            status: EntryStatus;
            publishAt: Date | null;
        }>;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    update<T extends keyof EntryMap>(params: {
        type: T;
        id: readonly string[];
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<FieldsForMap<EntryMap, T>>;
            status: EntryStatus;
            publishAt: Date | null;
        }>;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>[]>;
    update(params: { type: string; id: string; data: EntryUpdateData }): Promise<Entry>;
    update(params: {
        type: string;
        id: readonly string[];
        data: EntryUpdateData;
    }): Promise<Entry[]>;

    // ── duplicate ────────────────────────────────────────────────────────────
    duplicate<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        overrides?: Partial<{
            title: string;
            slug: string;
            locale: string;
            localeGroup: string;
            fields: Partial<FieldsForMap<EntryMap, T>>;
            status: EntryStatus;
        }>;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    // ── publish ──────────────────────────────────────────────────────────────
    publish<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    publish<T extends keyof EntryMap>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>[]>;
    publish(params: { type: string; id: string }): Promise<Entry>;
    publish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── unpublish ────────────────────────────────────────────────────────────
    unpublish<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    unpublish<T extends keyof EntryMap>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>[]>;
    unpublish(params: { type: string; id: string }): Promise<Entry>;
    unpublish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── schedule ─────────────────────────────────────────────────────────────
    schedule<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        publishAt: Date;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    schedule<T extends keyof EntryMap>(params: {
        type: T;
        id: readonly string[];
        publishAt: Date;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>[]>;
    schedule(params: { type: string; id: string; publishAt: Date }): Promise<Entry>;
    schedule(params: {
        type: string;
        id: readonly string[];
        publishAt: Date;
    }): Promise<Entry[]>;

    // ── restore ──────────────────────────────────────────────────────────────
    restore<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
    restore<T extends keyof EntryMap>(params: {
        type: T;
        id: readonly string[];
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>[]>;
    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    // ── versions / restoreVersion ────────────────────────────────────────────
    versions(params: { type: string; id: string }): Promise<EntryVersion[]>;
    restoreVersion<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        versionId: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>>>;
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

/** `TypedEntriesApi` — alias of `TypedEntriesApiFor` bound to the global map. */
export type TypedEntriesApi = TypedEntriesApiFor<AstromechEntryTypes>;

// ============================================================================
// AstromechClient
// ============================================================================

/** Map a plugin's SDK object type to its caller-facing callable signatures. */
export type SdkInterface<T> = {
    [K in keyof T]: T[K] extends PluginSdkMethod<infer I, infer O>
        ? (input: I) => Promise<O>
        : (input?: unknown) => Promise<unknown>;
};

/**
 * Augmented by plugins' own `.d.ts` via `declare module 'astromech'`: each
 * installed plugin's access key maps to its SDK method signatures. Empty by
 * default; plugins self-augment using `SdkInterface<typeof sdk>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginSdks {}

/**
 * Augmented by generated `astromech.d.ts` with per-plugin entry type maps.
 * Each key is a plugin name; the value maps bare type names to
 * `{ fields: ...; relations: ... }` shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginEntryTypes {}

/**
 * For a plugin name `Name`, produce an `entries` member typed against the
 * plugin's registered entry types (when present in `AstromechPluginEntryTypes`),
 * or fall back to the wide `EntriesApi`.
 */
type PluginEntriesFor<Name extends string> = Name extends keyof AstromechPluginEntryTypes
    ? { entries: TypedEntriesApiFor<AstromechPluginEntryTypes[Name]> }
    : { entries: EntriesApi };

export type PluginSdkNamespace = AstromechPluginSdks & {
    [Name in string]: PluginEntriesFor<Name> &
        Record<string, (input?: unknown) => Promise<unknown>>;
};

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
