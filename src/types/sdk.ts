/**
 * SDK types — AstromechClient, typed entry type proxy
 */

import type { Entry, EntryStatus, EntryVersion } from './domain.js';
import type {
    EntryTypeApi,
    EntriesApi,
    EntriesQueryOptions,
    MediaApi,
    PaginationResult,
    QueryOptions,
    SettingsApi,
    TranslationInfo,
    UsersApi,
    WhereFilters,
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
// Typed Entry Type API
// ============================================================================

// TypedEntryTypeApi — returned by the typed entries proxy when AstromechEntryTypes is augmented
export type TypedEntryTypeApi<TFields, TRelations> = {
    all(options?: QueryOptions): Promise<TypedEntry<TFields>[]>;
    all<K extends keyof TRelations & string>(
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<TypedEntry<Omit<TFields, K> & Pick<TRelations, K>>[]>;

    paginate(
        perPage: number,
        page: number,
        options?: QueryOptions
    ): Promise<PaginationResult<TypedEntry<TFields>>>;
    paginate<K extends keyof TRelations & string>(
        perPage: number,
        page: number,
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<PaginationResult<TypedEntry<Omit<TFields, K> & Pick<TRelations, K>>>>;

    get(id: string, options?: Omit<QueryOptions, 'populate'>): Promise<TypedEntry<TFields> | null>;
    get<K extends keyof TRelations & string>(
        id: string,
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<TypedEntry<Omit<TFields, K> & Pick<TRelations, K>> | null>;

    where(filters: WhereFilters, options?: QueryOptions): Promise<TypedEntry<TFields>[]>;

    create(data: {
        title: string;
        slug?: string;
        fields?: Partial<TFields>;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<TypedEntry<TFields>>;

    update(
        id: string,
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<TFields>;
            status: EntryStatus;
            publishAt: Date | null;
        }>
    ): Promise<TypedEntry<TFields>>;

    trash(id: string): Promise<void>;
    duplicate(id: string): Promise<TypedEntry<TFields>>;
    trashed(options?: QueryOptions): Promise<TypedEntry<TFields>[]>;
    restore(id: string): Promise<TypedEntry<TFields>>;
    delete(id: string): Promise<void>;
    emptyTrash(): Promise<void>;
    versions(id: string): Promise<EntryVersion[]>;
    restoreVersion(id: string, versionId: string): Promise<TypedEntry<TFields>>;
    translations(id: string): Promise<TranslationInfo[]>;
    translate(
        id: string,
        locale: string,
        data?: { title?: string; fields?: Partial<TFields> }
    ): Promise<TypedEntry<TFields>>;
    publish(id: string): Promise<TypedEntry<TFields>>;
    unpublish(id: string): Promise<TypedEntry<TFields>>;
    schedule(id: string, publishAt: Date): Promise<TypedEntry<TFields>>;
};

// ============================================================================
// Typed Entries Proxy
// ============================================================================

// The typed entries proxy type — used by AstromechClient when AstromechEntryTypes is augmented
export type TypedEntriesProxy = [keyof AstromechEntryTypes] extends [never]
    ? Record<string, EntryTypeApi>
    : {
          [K in keyof AstromechEntryTypes]: AstromechEntryTypes[K] extends {
              fields: infer F;
              relations: infer R;
          }
              ? TypedEntryTypeApi<F, R>
              : EntryTypeApi;
      } & Record<string, EntryTypeApi>;

// ============================================================================
// Typed Entries API
// ============================================================================

export type TypedEntriesApi =
    // ── all() ────────────────────────────────────────────────────────────────
    {
        all<T extends keyof AstromechEntryTypes, K extends keyof RelationsFor<T> & string>(
            options: { type: T; populate: K[] } & Omit<QueryOptions, 'populate'>
        ): Promise<TypedEntry<Omit<FieldsFor<T>, K> & Pick<RelationsFor<T>, K>>[]>;
        all<T extends keyof AstromechEntryTypes>(
            options: { type: T } & QueryOptions
        ): Promise<TypedEntry<FieldsFor<T>>[]>;
        all(options?: EntriesQueryOptions): Promise<Entry[]>;

        // ── paginate() ───────────────────────────────────────────────────────
        paginate<T extends keyof AstromechEntryTypes, K extends keyof RelationsFor<T> & string>(
            perPage: number,
            page: number,
            options: { type: T; populate: K[] } & Omit<QueryOptions, 'populate'>
        ): Promise<PaginationResult<TypedEntry<Omit<FieldsFor<T>, K> & Pick<RelationsFor<T>, K>>>>;
        paginate<T extends keyof AstromechEntryTypes>(
            perPage: number,
            page: number,
            options: { type: T } & QueryOptions
        ): Promise<PaginationResult<TypedEntry<FieldsFor<T>>>>;
        paginate(perPage: number, page: number, options?: EntriesQueryOptions): Promise<PaginationResult<Entry>>;

        // ── get() ────────────────────────────────────────────────────────────
        get<T extends keyof AstromechEntryTypes, K extends keyof RelationsFor<T> & string>(
            id: string,
            options: { type: T; populate: K[] } & Omit<QueryOptions, 'populate'>
        ): Promise<TypedEntry<Omit<FieldsFor<T>, K> & Pick<RelationsFor<T>, K>> | null>;
        get<T extends keyof AstromechEntryTypes>(
            id: string,
            options: { type: T } & QueryOptions
        ): Promise<TypedEntry<FieldsFor<T>> | null>;
        get(id: string, options?: EntriesQueryOptions): Promise<Entry | null>;

        // ── where() ──────────────────────────────────────────────────────────
        where<T extends keyof AstromechEntryTypes>(
            filters: WhereFilters,
            options: { type: T } & QueryOptions
        ): Promise<TypedEntry<FieldsFor<T>>[]>;
        where(filters: WhereFilters, options?: EntriesQueryOptions): Promise<Entry[]>;

        // ── create() ─────────────────────────────────────────────────────────
        create<T extends keyof AstromechEntryTypes>(data: {
            type: T;
            title: string;
            slug?: string;
            fields?: Partial<FieldsFor<T>>;
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<TypedEntry<FieldsFor<T>>>;
        create(data: {
            type: string;
            title: string;
            slug?: string;
            fields?: Record<string, unknown>;
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<Entry>;

        // update doesn't take a type param at runtime, so no typed overload —
        // falls through to EntriesApi's update signature
    } & Omit<EntriesApi, 'all' | 'paginate' | 'get' | 'where' | 'create'>;

// ============================================================================
// AstromechClient
// ============================================================================

export type AstromechClient = {
    entries: TypedEntriesApi;
    media: MediaApi;
    settings: SettingsApi;
    users: UsersApi;
    config: ResolvedConfig;
    configure(options: { baseUrl: string }): void;
};
