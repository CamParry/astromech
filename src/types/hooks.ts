/**
 * Hook system types — context types, HookRegistry, HookHandlers
 */

import type { Entry, EntryStatus, JsonObject, Media, User } from './domain.js';

// ============================================================================
// Hook Context Types
// ============================================================================

export type EntryCreateContext = {
    collection: string;
    data: {
        title: string;
        slug?: string;
        locale?: string;
        fields: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
        _translateFrom?: string;
    };
    user: User | null;
};

export type EntryAfterCreateContext = EntryCreateContext & {
    entry: Entry;
};

export type EntryUpdateContext = {
    collection: string;
    entry: Entry;
    data: Partial<{
        title: string;
        slug: string;
        locale: string;
        fields: JsonObject;
        status: EntryStatus;
        publishAt: Date | null;
    }>;
    user: User | null;
};

export type EntryDeleteContext = {
    collection: string;
    entry: Entry;
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
    'entry:beforeCreate': (ctx: EntryCreateContext) => Promise<void> | void;
    'entry:afterCreate': (ctx: EntryAfterCreateContext) => Promise<void> | void;
    'entry:beforeUpdate': (ctx: EntryUpdateContext) => Promise<void> | void;
    'entry:afterUpdate': (ctx: EntryUpdateContext) => Promise<void> | void;
    'entry:beforeDelete': (ctx: EntryDeleteContext) => Promise<void> | void;
    'entry:afterDelete': (ctx: EntryDeleteContext) => Promise<void> | void;
    'media:beforeUpload': (ctx: MediaUploadContext) => Promise<void> | void;
    'media:afterUpload': (ctx: MediaUploadContext) => Promise<void> | void;
    'media:beforeDelete': (ctx: MediaDeleteContext) => Promise<void> | void;
    'auth:afterLogin': (ctx: AuthContext) => Promise<void> | void;
    'auth:afterLogout': (ctx: AuthContext) => Promise<void> | void;
    'api:beforeRequest': (ctx: ApiRequestContext) => Promise<void> | void;
    'api:afterRequest': (ctx: ApiResponseContext) => Promise<void> | void;
    'admin:registerRoutes': (ctx: AdminRouteContext) => void;
};
