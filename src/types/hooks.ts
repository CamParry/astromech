/**
 * Hook system types.
 *
 * The registry is OPEN: core fires a known set of events (typed via
 * `CoreHookHandlers`), and plugins may declare and fire their own events
 * (`hookEvents` + `ctx.emit`). A hook event name is therefore
 * `KnownCoreEvent | (string & {})`.
 */

import type { Entry, EntryStatus, JsonObject, Media, User } from './domain.js';

// ============================================================================
// Hook Context Types (core events)
// ============================================================================

export type EntryCreateContext = {
    type: string;
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
    type: string;
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
    type: string;
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

// ============================================================================
// Hook Registry (open)
// ============================================================================

/**
 * The set of core events Astromech fires. `before*` handlers gate the
 * operation (a throw aborts); `after*` handlers run post-commit and are
 * swallow-and-logged (a throw never rolls back).
 */
export type CoreHookHandlers = {
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
};

export type KnownCoreEvent = keyof CoreHookHandlers;

/** Any event name — a known core event or a plugin-declared custom event. */
export type HookEvent = KnownCoreEvent | (string & {});

/** A handler for a custom (plugin-declared) event. Payload is opaque to core. */
export type HookHandler<Payload = unknown> = (payload: Payload) => Promise<void> | void;

/** Union of every core handler signature — the index-signature value type. */
type AnyCoreHookHandler = CoreHookHandlers[KnownCoreEvent];

/**
 * The `hooks` map on a plugin definition: known events are strongly typed,
 * custom events accept an opaque payload. One handler per event per plugin —
 * compose internally if you need several.
 */
export type PluginHooks = Partial<CoreHookHandlers> &
    Record<string, AnyCoreHookHandler | HookHandler | undefined>;
