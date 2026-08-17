/**
 * Hook system types.
 *
 * The registry is OPEN: core fires a known set of events (typed via
 * `CoreHookHandlers`), and plugins may declare and fire their own events
 * (`hookEvents` + `ctx.emit`). A hook event name is therefore
 * `KnownCoreEvent | (string & {})`.
 *
 * Failure semantics are keyed off the event name for both core and custom
 * events: `before*` handlers gate the operation (a throw aborts); `after*`
 * handlers run post-commit and are swallow-and-logged. A custom event emitted
 * via `ctx.emit` follows the same rule by substring — a name containing
 * `:before` gates; everything else is swallow-and-logged.
 */

import type { Entry, EntryStatus, JsonObject, Media, User } from './domain';
import type { PluginContext } from './plugins';

// ============================================================================
// Hook Context Types (core events)
// ============================================================================

/**
 * `data` is the row about to be written, not a copy of it: a `beforeCreate`
 * handler that assigns to it changes what is persisted and what the
 * relationship index derives from.
 */
export type EntryCreateContext = {
    type: string;
    data: {
        title: string;
        slug: string | null;
        locale: string;
        localeGroup?: string;
        fields: JsonObject;
        status: EntryStatus;
        publishedAt: Date | null;
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
        publishedAt: Date | null;
    }>;
    user: User | null;
};

export type EntryDeleteContext = {
    type: string;
    entry: Entry;
    user: User | null;
    permanent: boolean;
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
    'entry:beforeCreate': (
        ctx: EntryCreateContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'entry:afterCreate': (
        ctx: EntryAfterCreateContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'entry:beforeUpdate': (
        ctx: EntryUpdateContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'entry:afterUpdate': (
        ctx: EntryUpdateContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'entry:beforeDelete': (
        ctx: EntryDeleteContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'entry:afterDelete': (
        ctx: EntryDeleteContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'media:beforeUpload': (
        ctx: MediaUploadContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'media:afterUpload': (
        ctx: MediaUploadContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'media:beforeDelete': (
        ctx: MediaDeleteContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'auth:afterLogin': (ctx: AuthContext, plugin: PluginContext) => Promise<void> | void;
    'auth:afterLogout': (ctx: AuthContext, plugin: PluginContext) => Promise<void> | void;
    'api:beforeRequest': (
        ctx: ApiRequestContext,
        plugin: PluginContext
    ) => Promise<void> | void;
    'api:afterRequest': (
        ctx: ApiResponseContext,
        plugin: PluginContext
    ) => Promise<void> | void;
};

export type KnownCoreEvent = keyof CoreHookHandlers;

/** Any event name — a known core event or a plugin-declared custom event. */
/**
 * Augmented by the generated `astromech.d.ts` with events plugins declare via
 * `hookEvents`. Empty by default.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginHookEvents {}

export type HookEvent = KnownCoreEvent | keyof AstromechPluginHookEvents | (string & {});

/**
 * A handler for a custom (plugin-declared) event. The payload is opaque to
 * core; the second argument is the firing plugin's context.
 */
export type HookHandler<Payload = unknown> = (
    payload: Payload,
    plugin: PluginContext
) => Promise<void> | void;

/** Union of every core handler signature — the index-signature value type. */
export type AnyCoreHookHandler = CoreHookHandlers[KnownCoreEvent];

/** Resolve the correct handler signature for an event key. */
export type HookHandlerFor<E extends HookEvent> = E extends keyof CoreHookHandlers
    ? CoreHookHandlers[E]
    : E extends keyof AstromechPluginHookEvents
      ? HookHandler<AstromechPluginHookEvents[E]>
      : HookHandler;

/** One hook: an event key bound to its handler. */
export type Hook = {
    event: HookEvent;
    handler: AnyCoreHookHandler | HookHandler;
};

/** A plugin's hooks: an array of `defineHook(...)` results. Multiple handlers per event are allowed. */
export type PluginHooks = Hook[];
