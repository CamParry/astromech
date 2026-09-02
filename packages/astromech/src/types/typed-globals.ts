/**
 * The typed-global narrowing surface — the generated global map the codegen
 * augments, and the literal-type overloads layered over it.
 *
 * Runtime is `GlobalsService` (services.ts). This file layers literal-key
 * overloads on top so a caller passing a string-literal `key` gets a narrowed
 * `TypedGlobal` result instead of the wide `Global`.
 */

import type { Global, GlobalVersion } from './domain';
import type { GlobalsService, GlobalUpdateData } from './services';

/**
 * Open interface augmented by generated types (`.astro/astromech.d.ts`). Each
 * global's shape: `{ fields }`, keyed by the global's addressable id.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechGlobalTypes {}

/** Extract the field type from any global map by key. */
type FieldsForMap<Map, K extends keyof Map> = Map[K] extends { fields: infer F }
    ? F
    : never;

/** Resolves to the field type for global `K`. */
export type GlobalFieldsFor<K extends keyof AstromechGlobalTypes> = FieldsForMap<
    AstromechGlobalTypes,
    K
>;

/** The `Global` type with `fields` narrowed to `TFields`. */
export type TypedGlobal<TFields> = Omit<Global, 'fields'> & {
    fields: TFields;
};

/**
 * Layered overloads above the wide `GlobalsService`, parameterised by a global
 * map. A literal `key` returns `TypedGlobal<…>`; the wide string fallback
 * returns `Global`.
 *
 * There is one overload per method rather than the full/public pair entries
 * carry: the generator emits a single `fields` type per global, so the shape
 * axis narrows nothing here.
 */
export type TypedGlobalsServiceFor<GlobalMap> = {
    get<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
        full?: boolean;
        staged?: boolean;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>> | null>;
    get(params: {
        key: string;
        locale?: string;
        full?: boolean;
        staged?: boolean;
    }): Promise<Global | null>;

    update<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
        staged?: boolean;
        data: { fields: Partial<FieldsForMap<GlobalMap, K>> };
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    update(params: {
        key: string;
        locale?: string;
        staged?: boolean;
        data: GlobalUpdateData;
    }): Promise<Global>;

    publish<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    publish(params: { key: string; locale?: string }): Promise<Global>;

    unpublish<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    unpublish(params: { key: string; locale?: string }): Promise<Global>;

    schedule<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
        publishedAt: Date;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    schedule(params: {
        key: string;
        locale?: string;
        publishedAt: Date;
    }): Promise<Global>;

    versions(params: { key: string; locale?: string }): Promise<GlobalVersion[]>;

    restoreVersion<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
        versionId: string;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    restoreVersion(params: {
        key: string;
        locale?: string;
        versionId: string;
    }): Promise<Global>;

    createStaged<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
        data?: { fields: Partial<FieldsForMap<GlobalMap, K>> };
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    createStaged(params: {
        key: string;
        locale?: string;
        data?: GlobalUpdateData;
    }): Promise<Global>;

    getStaged<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>> | null>;
    getStaged(params: { key: string; locale?: string }): Promise<Global | null>;

    mergeStaged<K extends keyof GlobalMap>(params: {
        key: K;
        locale?: string;
    }): Promise<TypedGlobal<FieldsForMap<GlobalMap, K>>>;
    mergeStaged(params: { key: string; locale?: string }): Promise<Global>;
} & Omit<
    GlobalsService,
    | 'get'
    | 'update'
    | 'publish'
    | 'unpublish'
    | 'schedule'
    | 'versions'
    | 'restoreVersion'
    | 'createStaged'
    | 'getStaged'
    | 'mergeStaged'
>;

/** `TypedGlobalsService` — alias of `TypedGlobalsServiceFor` bound to the global map. */
export type TypedGlobalsService = TypedGlobalsServiceFor<AstromechGlobalTypes>;
