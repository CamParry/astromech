/**
 * Client types — AstromechClient and the typed-entry narrowing surface.
 *
 * Runtime is `EntriesService` (services.ts). This file layers literal-type
 * overloads on top so that callers passing string-literal types get a narrowed
 * `TypedEntry` result instead of the wide `Entry`.
 */

import type { Entry, EntryStatus, EntryVersion, JsonObject } from './domain.js';
import type {
    EntriesService,
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    MediaService,
    NotificationsService,
    QueryResult,
    SettingsService,
    UsersService,
} from './services.js';
import type { ResolvedConfig } from './config.js';
import type { ServiceMethod } from './plugins.js';

// ============================================================================
// Typed Entry
// ============================================================================

// Open interface — augmented by generated types (.astro/astromech.d.ts)
// Each entry shape: { fields: EntryTypeFields, fieldsPublic: PublicFields, relations: EntryTypeRelations }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechEntryTypes {}

// Generic helpers — extract fields/fieldsPublic from any entry-type map by key
type FieldsForMap<Map, T extends keyof Map> = Map[T] extends { fields: infer F }
    ? F
    : never;
type PublicFieldsForMap<Map, T extends keyof Map> = Map[T] extends {
    fieldsPublic: infer P;
}
    ? P
    : JsonObject & { readonly __shape?: 'public' };

// Typed entry — the Entry type but with typed fields
export type TypedEntry<TFields> = Omit<Entry, 'fields'> & {
    fields: TFields;
};

/**
 * Resolves to the full (admin) field type for entry type `T`.
 * Bound to the global `AstromechEntryTypes` map.
 */
export type FieldsFor<T extends keyof AstromechEntryTypes> = FieldsForMap<
    AstromechEntryTypes,
    T
>;

/**
 * Resolves to the public field type for entry type `T` — full fields minus any
 * `private: true` fields, with `_disabled`/`_title` stripped from instance types.
 * Degrades to `JsonObject & { readonly __shape?: 'public' }` before the type
 * generator (Step 2) emits the real per-collection public types.
 */
export type PublicFieldsFor<T extends keyof AstromechEntryTypes> = PublicFieldsForMap<
    AstromechEntryTypes,
    T
>;

// ============================================================================
// Typed Entries API
// ============================================================================

/**
 * Layered overloads above the wide `EntriesService`, parameterised by an entry-type
 * map. Literal-type `type` args return `TypedEntry<FieldsFor<T>>`; the wide
 * overload fallback returns `Entry`.
 *
 * `TypedEntriesService` is the standard alias bound to the global
 * `AstromechEntryTypes`.
 */
export type TypedEntriesServiceFor<EntryMap> = {
    // ── query ────────────────────────────────────────────────────────────────
    // full: true — returns the full (admin) shape
    query<T extends keyof EntryMap>(
        params: { type: T; full: true } & Omit<EntryQueryParams, 'type' | 'full'>
    ): Promise<QueryResult<TypedEntry<FieldsForMap<EntryMap, T>>>>;
    // default — returns public shape
    query<T extends keyof EntryMap>(
        params: { type: T } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<PublicFieldsForMap<EntryMap, T>>>>;
    // Deliberately separate from the single-type overload: a union parameter
    // would degrade inference of T at call sites.
    /* eslint-disable @typescript-eslint/unified-signatures */
    query<T extends keyof EntryMap>(
        params: { type: readonly T[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<TypedEntry<PublicFieldsForMap<EntryMap, T>>>>;
    /* eslint-enable @typescript-eslint/unified-signatures */
    query(
        params: { type: string | readonly string[] } & Omit<EntryQueryParams, 'type'>
    ): Promise<QueryResult<Entry>>;

    // ── get ──────────────────────────────────────────────────────────────────
    // full: true — returns the full (admin) shape
    get<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        full: true;
        locale?: string;
    }): Promise<TypedEntry<FieldsForMap<EntryMap, T>> | null>;
    // default — returns public shape
    get<T extends keyof EntryMap>(params: {
        type: T;
        id: string;
        locale?: string;
    }): Promise<TypedEntry<PublicFieldsForMap<EntryMap, T>> | null>;
    get(params: {
        type: string;
        id: string;
        locale?: string;
        full?: boolean;
    }): Promise<Entry | null>;

    // ── create ───────────────────────────────────────────────────────────────
    create<T extends keyof EntryMap>(params: {
        type: T;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: Partial<FieldsForMap<EntryMap, T>> & { readonly __shape?: 'full' };
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
            fields: Partial<FieldsForMap<EntryMap, T>> & { readonly __shape?: 'full' };
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
            fields: Partial<FieldsForMap<EntryMap, T>> & { readonly __shape?: 'full' };
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
    EntriesService,
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

/** `TypedEntriesService` — alias of `TypedEntriesServiceFor` bound to the global map. */
export type TypedEntriesService = TypedEntriesServiceFor<AstromechEntryTypes>;

// ============================================================================
// AstromechClient
// ============================================================================

/** Map a plugin's service object type to its caller-facing callable signatures. */
export type ServiceInterface<T> = {
    [K in keyof T]: T[K] extends ServiceMethod<infer I, infer O>
        ? (input: I) => Promise<O>
        : (input?: unknown) => Promise<unknown>;
};

/**
 * Augmented by plugins' own `.d.ts` via `declare module 'astromech'`: each
 * installed plugin's access key maps to its service method signatures. Empty
 * by default; plugins self-augment using `ServiceInterface<typeof service>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginServices {}

/**
 * Plugin service methods only. A plugin's ENTRY types are NOT reachable here —
 * they live on the one entries service, addressed by their qualified id
 * (`Astromech.entries.query({ type: 'redirects/redirect' })`). Two entry points
 * to the same content was the problem, not a feature.
 */
export type PluginServiceNamespace = AstromechPluginServices &
    Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;

export type AstromechClient = {
    entries: TypedEntriesService;
    media: MediaService;
    settings: SettingsService;
    users: UsersService;
    notifications: NotificationsService;
    config: ResolvedConfig;
    /** Plugin RPC methods — `Astromech.plugins.<name>.<method>(input)`. */
    plugins?: PluginServiceNamespace;
    configure(options: { baseUrl: string }): void;
};
