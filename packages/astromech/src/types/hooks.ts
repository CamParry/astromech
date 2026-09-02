/**
 * Hook system types: the event → payload map. Core fires a known set of
 * events (`CoreHookHandlers`); plugins may declare and fire their own
 * (`hookEvents`). An event name is `KnownCoreEvent | (string & {})`.
 */

import type { Entry, EntryStatus, Global, JsonObject, User } from './domain';
import type { PluginContext } from './plugins';

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
        fields: JsonObject;
        status: EntryStatus;
        publishedAt: Date | null;
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

/**
 * A write to one locale of one global. `global` is null when that locale has
 * never been saved — the first `update` creates it, so a before-handler sees
 * no prior record.
 */
export type GlobalUpdateContext = {
    key: string;
    locale: string;
    /** Null when the global has never been saved in this locale. */
    global: Global | null;
    data: { fields: JsonObject };
    user: User | null;
};

export type EntryDeleteContext = {
    type: string;
    entry: Entry;
    user: User | null;
    permanent: boolean;
};

// A handler commonly returns nothing; `void` in the union (rather than
// `undefined`) is what lets a handler omit `return` entirely, which is why
// this block turns the generally-correct `no-invalid-void-type` rule off.
/* eslint-disable @typescript-eslint/no-invalid-void-type */
/** The set of core events Astromech fires, one payload type per event. */
export type CoreHookHandlers = {
    'entry:beforeCreate': (
        ctx: EntryCreateContext,
        plugin: PluginContext
    ) => Promise<void | EntryCreateContext> | void | EntryCreateContext;
    'entry:afterCreate': (
        ctx: EntryAfterCreateContext,
        plugin: PluginContext
    ) => Promise<void | EntryAfterCreateContext> | void | EntryAfterCreateContext;
    'entry:beforeUpdate': (
        ctx: EntryUpdateContext,
        plugin: PluginContext
    ) => Promise<void | EntryUpdateContext> | void | EntryUpdateContext;
    'entry:afterUpdate': (
        ctx: EntryUpdateContext,
        plugin: PluginContext
    ) => Promise<void | EntryUpdateContext> | void | EntryUpdateContext;
    'global:beforeUpdate': (
        ctx: GlobalUpdateContext,
        plugin: PluginContext
    ) => Promise<void | GlobalUpdateContext> | void | GlobalUpdateContext;
    'global:afterUpdate': (
        ctx: GlobalUpdateContext,
        plugin: PluginContext
    ) => Promise<void | GlobalUpdateContext> | void | GlobalUpdateContext;
    'entry:beforeDelete': (
        ctx: EntryDeleteContext,
        plugin: PluginContext
    ) => Promise<void | EntryDeleteContext> | void | EntryDeleteContext;
    'entry:afterDelete': (
        ctx: EntryDeleteContext,
        plugin: PluginContext
    ) => Promise<void | EntryDeleteContext> | void | EntryDeleteContext;
};
/* eslint-enable @typescript-eslint/no-invalid-void-type */

export type KnownCoreEvent = keyof CoreHookHandlers;

/**
 * Augmented by the generated `astromech.d.ts` with events plugins declare via
 * `hookEvents`. Empty by default.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginHookEvents {}

/** Any event name — a known core event or a plugin-declared custom event. */
export type HookEvent = KnownCoreEvent | keyof AstromechPluginHookEvents | (string & {});

/**
 * A handler for a custom (plugin-declared) event. The payload is opaque to
 * core; a non-`undefined` return replaces it for the next handler.
 */
// Same `void`-in-union reasoning as `CoreHookHandlers` above.
/* eslint-disable @typescript-eslint/no-invalid-void-type */
export type HookHandler<Payload = unknown> = (
    payload: Payload,
    plugin: PluginContext
) => Promise<void | Payload> | void | Payload;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

/** Union of every core handler signature — the index-signature value type. */
export type AnyCoreHookHandler = CoreHookHandlers[KnownCoreEvent];

/** Resolve the correct handler signature for an event key. */
export type HookHandlerFor<E extends HookEvent> = E extends keyof CoreHookHandlers
    ? CoreHookHandlers[E]
    : E extends keyof AstromechPluginHookEvents
      ? HookHandler<AstromechPluginHookEvents[E]>
      : HookHandler;

/** The context a core event's handlers receive, derived from `CoreHookHandlers`. */
export type HookContextFor<E extends KnownCoreEvent> = Parameters<CoreHookHandlers[E]>[0];

/** The payload type for `event` — known core event, plugin-declared, or custom. */
export type HookPayloadFor<E extends HookEvent> = Parameters<HookHandlerFor<E>>[0];

/** One hook: an event key bound to its handler. */
export type Hook = {
    event: HookEvent;
    handler: AnyCoreHookHandler | HookHandler;
};

/** A plugin's hooks: an array of `defineHook(...)` results. Multiple handlers per event are allowed. */
export type PluginHooks = Hook[];
