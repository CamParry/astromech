/**
 * SDK types — AstromechClient, typed collection proxy
 */

import type { Entry, EntryStatus, EntryVersion } from './domain.js';
import type {
    CollectionApi,
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
// Each entry shape: { fields: CollectionFields, relations: CollectionRelations }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AstromechCollections {}

// Typed entry — the Entry type but with typed fields
export type TypedEntry<TFields> = Omit<Entry, 'fields'> & {
    fields: TFields;
};

// ============================================================================
// Typed Collection API
// ============================================================================

// TypedCollectionApi — returned by the typed collections proxy when AstromechCollections is augmented
export type TypedCollectionApi<TFields, TRelations> = {
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
// Typed Collections Proxy
// ============================================================================

// The typed collections proxy type — used by AstromechClient when AstromechCollections is augmented
export type TypedCollectionsProxy = [keyof AstromechCollections] extends [never]
    ? Record<string, CollectionApi>
    : {
          [K in keyof AstromechCollections]: AstromechCollections[K] extends {
              fields: infer F;
              relations: infer R;
          }
              ? TypedCollectionApi<F, R>
              : CollectionApi;
      } & Record<string, CollectionApi>;

// ============================================================================
// AstromechClient
// ============================================================================

export type AstromechClient = {
    collections: TypedCollectionsProxy;
    media: MediaApi;
    settings: SettingsApi;
    users: UsersApi;
    config: ResolvedConfig;
    configure(options: { baseUrl: string }): void;
};
