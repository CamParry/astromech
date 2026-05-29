/**
 * Plugin runtime.
 *
 * Holds the registry of installed plugins (hooks / sdk / raw routes), builds
 * the unified PluginContext, and runs hooks with the documented failure
 * semantics: `before*` hooks gate the operation (a throw aborts), `after*`
 * hooks and emitted events are swallow-and-logged (a throw never rolls back).
 *
 * Config is injected via `registerPlugins` rather than imported from
 * `virtual:astromech/config`, so this module stays unit-testable.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { ReactElement } from 'react';
import type {
    AstromechClient,
    PluginContext,
    PluginConfigView,
    PluginDefinition,
    PluginLogger,
    PluginRawRoute,
    PluginSdkMethod,
    ResolvedConfig,
    ResolvedPluginIdentity,
    User,
} from '@/types/index.js';
import { getDb } from '@/db/registry.js';
import { getEmailConfig } from '@/email/registry.js';
import { renderEmail } from '@/email/render.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';

// ============================================================================
// Registry (globalThis — visible from config:setup through request time)
// ============================================================================

type HookCallback = (eventCtx: unknown, ctx: PluginContext) => Promise<void> | void;

type RegisteredHook = { identity: ResolvedPluginIdentity; handler: HookCallback };
type RegisteredRawRoute = { identity: ResolvedPluginIdentity; route: PluginRawRoute };

type PluginRuntimeState = {
    config: ResolvedConfig | null;
    identities: ResolvedPluginIdentity[];
    hooks: Map<string, RegisteredHook[]>;
    sdk: Map<string, Record<string, PluginSdkMethod>>;
    rawRoutes: RegisteredRawRoute[];
    sdkClient: AstromechClient | null;
};

declare global {
    var __astromechPluginRuntime: PluginRuntimeState | undefined;
}

function state(): PluginRuntimeState {
    if (!globalThis.__astromechPluginRuntime) {
        globalThis.__astromechPluginRuntime = {
            config: null,
            identities: [],
            hooks: new Map(),
            sdk: new Map(),
            rawRoutes: [],
            sdkClient: null,
        };
    }
    return globalThis.__astromechPluginRuntime;
}

/**
 * Index all installed plugins into the runtime registry. Called once at boot
 * (Astro `config:setup`). Identity collisions and dependencies are validated
 * earlier in `resolveConfig`.
 */
export function registerPlugins(defs: PluginDefinition[], config: ResolvedConfig): void {
    const s = state();
    s.config = config;
    s.identities = [];
    s.hooks = new Map();
    s.sdk = new Map();
    s.rawRoutes = [];

    for (const def of defs) {
        const identity = resolvePluginIdentity(def);
        s.identities.push(identity);

        for (const [event, handler] of Object.entries(def.hooks ?? {})) {
            if (!handler) continue;
            const list = s.hooks.get(event) ?? [];
            list.push({ identity, handler: handler as HookCallback });
            s.hooks.set(event, list);
        }

        if (def.sdk) {
            s.sdk.set(identity.name, def.sdk);
        }

        for (const route of def.rawRoutes ?? []) {
            s.rawRoutes.push({ identity, route });
        }
    }
}

export function getPluginIdentities(): ResolvedPluginIdentity[] {
    return state().identities;
}

export function getPluginSdkMethods(): Map<string, Record<string, PluginSdkMethod>> {
    return state().sdk;
}

export function getPluginRawRoutes(): RegisteredRawRoute[] {
    return state().rawRoutes;
}

/** Set by the local SDK at module load to break the import cycle. */
export function setPluginSdkClient(client: AstromechClient): void {
    state().sdkClient = client;
}

// ============================================================================
// Context construction
// ============================================================================

function resolveEnv(): Record<string, string | undefined> {
    const fromProcess = typeof process !== 'undefined' ? process.env : {};
    let fromImportMeta: Record<string, string | undefined>;
    try {
        // Populated by Vite in Astro SSR; absent in plain Node — guard for both.
        fromImportMeta =
            (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    } catch {
        fromImportMeta = {};
    }
    return { ...fromProcess, ...fromImportMeta };
}

function makeLogger(name: string): PluginLogger {
    const tag = `[plugin:${name}]`;
    return {
        info: (message) => console.info(`${tag} ${message}`),
        warn: (message) => console.warn(`${tag} ${message}`),
        error: (message, error) => console.error(`${tag} ${message}`, error ?? ''),
    };
}

function makeConfigView(config: ResolvedConfig): PluginConfigView {
    return {
        ...config,
        entryTypesWithField(fieldName: string): string[] {
            return Object.entries(config.entries)
                .filter(([, entryType]) =>
                    entryType.fieldGroups.some((group) =>
                        group.fields.some((field) => field.name === fieldName)
                    )
                )
                .map(([name]) => name);
        },
    };
}

async function sendEmail(to: string, subject: string, element: ReactElement): Promise<void> {
    const emailConfig = getEmailConfig();
    if (!emailConfig) {
        throw new Error('[Astromech] Email is not configured; cannot send from a plugin.');
    }
    const { html, text } = await renderEmail(element);
    await emailConfig.driver.send({ to, from: emailConfig.from, subject, html, text });
}

/**
 * Build the unified PluginContext for a given plugin and acting user. `db` and
 * `sdk` are lazy so a context can be constructed in environments where they are
 * not yet wired (e.g. unit tests that exercise only hook semantics).
 */
export function createPluginContext(
    identity: ResolvedPluginIdentity,
    user: User | null
): PluginContext {
    const config = state().config;
    const configView = config ? makeConfigView(config) : makeConfigView(emptyConfig());

    return {
        get db(): LibSQLDatabase {
            return getDb();
        },
        config: configView,
        user,
        get sdk(): AstromechClient {
            const client = state().sdkClient;
            if (!client) {
                throw new Error('[Astromech] Plugin SDK client is not available in this context.');
            }
            return client;
        },
        sendEmail,
        logger: makeLogger(identity.name),
        env: resolveEnv(),
        emit: (event, payload) => emitEvent(event, payload, user),
    };
}

function emptyConfig(): ResolvedConfig {
    return {
        adminRoute: '/admin',
        apiRoute: '/api',
        entries: {},
        trash: { enabled: true, retentionDays: 30 },
        storage: {
            name: 'noop',
            upload: () => Promise.resolve(''),
            delete: () => Promise.resolve(),
            getUrl: () => '',
        },
    } as ResolvedConfig;
}

// ============================================================================
// Hook execution
// ============================================================================

/**
 * Run `before*` hooks for an event. A handler throw propagates to the caller
 * and aborts the operation (validation gate).
 */
export async function runBeforeHooks(
    event: string,
    eventCtx: unknown,
    user: User | null
): Promise<void> {
    for (const { identity, handler } of state().hooks.get(event) ?? []) {
        await handler(eventCtx, createPluginContext(identity, user));
    }
}

/**
 * Run `after*` hooks for an event. Each handler is swallow-and-logged with
 * plugin attribution; a throw never rolls back committed work.
 */
export async function runAfterHooks(
    event: string,
    eventCtx: unknown,
    user: User | null
): Promise<void> {
    for (const { identity, handler } of state().hooks.get(event) ?? []) {
        const ctx = createPluginContext(identity, user);
        try {
            await handler(eventCtx, ctx);
        } catch (error) {
            ctx.logger.error(`hook "${event}" failed`, error);
        }
    }
}

/**
 * Fire a (typically plugin-declared) custom event. Subscribers run with
 * swallow-and-log semantics, like `after*` hooks.
 */
export async function emitEvent(
    event: string,
    payload: unknown,
    user: User | null
): Promise<void> {
    await runAfterHooks(event, payload, user);
}
