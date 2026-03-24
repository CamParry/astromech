/**
 * SDK types — AstromechClient, typed collection proxy
 */

import type { Entity, EntityStatus, EntityVersion, JsonObject } from './domain.js';
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
// Typed Entity
// ============================================================================

// Open interface — augmented by generated types (.astro/astromech.d.ts)
// Each entry shape: { fields: CollectionFields, relations: CollectionRelations }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AstromechCollections {}

// Typed entity — the Entity type but with typed fields
export type TypedEntity<TFields> = Omit<Entity, 'fields'> & {
    fields: TFields;
};

// ============================================================================
// Typed Collection API
// ============================================================================

// TypedCollectionApi — returned by the typed collections proxy when AstromechCollections is augmented
export type TypedCollectionApi<TFields, TRelations> = {
    all(options?: QueryOptions): Promise<TypedEntity<TFields>[]>;
    all<K extends keyof TRelations & string>(
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<TypedEntity<Omit<TFields, K> & Pick<TRelations, K>>[]>;

    paginate(
        perPage: number,
        page: number,
        options?: QueryOptions
    ): Promise<PaginationResult<TypedEntity<TFields>>>;
    paginate<K extends keyof TRelations & string>(
        perPage: number,
        page: number,
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<PaginationResult<TypedEntity<Omit<TFields, K> & Pick<TRelations, K>>>>;

    get(id: string, options?: Omit<QueryOptions, 'populate'>): Promise<TypedEntity<TFields> | null>;
    get<K extends keyof TRelations & string>(
        id: string,
        options: Omit<QueryOptions, 'populate'> & { populate: K[] }
    ): Promise<TypedEntity<Omit<TFields, K> & Pick<TRelations, K>> | null>;

    where(filters: WhereFilters, options?: QueryOptions): Promise<TypedEntity<TFields>[]>;

    create(data: {
        title: string;
        slug?: string;
        fields?: Partial<TFields>;
        status?: EntityStatus;
        publishAt?: Date | null;
    }): Promise<TypedEntity<TFields>>;

    update(
        id: string,
        data: Partial<{
            title: string;
            slug: string;
            fields: Partial<TFields>;
            status: EntityStatus;
            publishAt: Date | null;
        }>
    ): Promise<TypedEntity<TFields>>;

    trash(id: string): Promise<void>;
    duplicate(id: string): Promise<TypedEntity<TFields>>;
    trashed(options?: QueryOptions): Promise<TypedEntity<TFields>[]>;
    restore(id: string): Promise<TypedEntity<TFields>>;
    delete(id: string): Promise<void>;
    emptyTrash(): Promise<void>;
    versions(id: string): Promise<EntityVersion[]>;
    restoreVersion(id: string, versionId: string): Promise<TypedEntity<TFields>>;
    translations(id: string): Promise<TranslationInfo[]>;
    translate(
        id: string,
        locale: string,
        data?: { title?: string; fields?: Partial<TFields> }
    ): Promise<TypedEntity<TFields>>;
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
