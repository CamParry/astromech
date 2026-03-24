/**
 * Hook system types — context types, HookRegistry, HookHandlers
 */

import type { Entity, EntityStatus, JsonObject, Media, User } from './domain.js';

// ============================================================================
// Hook Context Types
// ============================================================================

export type EntityCreateContext = {
    collection: string;
    data: {
        title: string;
        slug?: string;
        locale?: string;
        fields: JsonObject;
        status?: EntityStatus;
        publishAt?: Date | null;
        _translateFrom?: string;
    };
    user: User | null;
};

export type EntityAfterCreateContext = EntityCreateContext & {
    entity: Entity;
};

export type EntityUpdateContext = {
    collection: string;
    entity: Entity;
    data: Partial<{
        title: string;
        slug: string;
        locale: string;
        fields: JsonObject;
        status: EntityStatus;
        publishAt: Date | null;
    }>;
    user: User | null;
};

export type EntityDeleteContext = {
    collection: string;
    entity: Entity;
    user: User | null;
    force: boolean;
};

export type MediaUploadContext = {
    file: File;
    media: Media;
    user: User | null;
};

export type MediaDeleteContext = {
    media: Media;
    user: User | null;
};

export type AuthContext = {
    user: User;
    session: unknown;
};

export type ApiRequestContext = {
    request: Request;
    user: User | null;
};

export type ApiResponseContext = {
    request: Request;
    response: Response;
    user: User | null;
};

export type AdminRouteContext = {
    registerRoute: (path: string, component: unknown) => void;
};

// ============================================================================
// Hook Registry
// ============================================================================

export type HookRegistry = {
    on<K extends keyof HookHandlers>(event: K, handler: HookHandlers[K]): void;
};

export type HookHandlers = {
    'entity:beforeCreate': (ctx: EntityCreateContext) => Promise<void> | void;
    'entity:afterCreate': (ctx: EntityAfterCreateContext) => Promise<void> | void;
    'entity:beforeUpdate': (ctx: EntityUpdateContext) => Promise<void> | void;
    'entity:afterUpdate': (ctx: EntityUpdateContext) => Promise<void> | void;
    'entity:beforeDelete': (ctx: EntityDeleteContext) => Promise<void> | void;
    'entity:afterDelete': (ctx: EntityDeleteContext) => Promise<void> | void;
    'media:beforeUpload': (ctx: MediaUploadContext) => Promise<void> | void;
    'media:afterUpload': (ctx: MediaUploadContext) => Promise<void> | void;
    'media:beforeDelete': (ctx: MediaDeleteContext) => Promise<void> | void;
    'auth:afterLogin': (ctx: AuthContext) => Promise<void> | void;
    'auth:afterLogout': (ctx: AuthContext) => Promise<void> | void;
    'api:beforeRequest': (ctx: ApiRequestContext) => Promise<void> | void;
    'api:afterRequest': (ctx: ApiResponseContext) => Promise<void> | void;
    'admin:registerRoutes': (ctx: AdminRouteContext) => void;
};
