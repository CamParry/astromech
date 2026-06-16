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
    AnyPluginSdkMethod,
    AstromechClient,
    EntriesApi,
    PluginContext,
    PluginConfigView,
    PluginDefinition,
    PluginLogger,
    PluginRawRoute,
    ResolvedConfig,
    ResolvedEntryTypeConfig,
    ResolvedPluginIdentity,
    User,
} from '@/types/index.js';
import { getDb } from '@/db/registry.js';
import { getEmailConfig } from '@/email/registry.js';
import { renderEmail } from '@/email/render.js';
import { pluginEntryTypes, resolvePluginIdentity } from '@/core/plugin-identity.js';
import { registerCronJob } from '@/cron/registry.js';
import { qualifyEntryType } from '@/core/entry-types.js';
import { flattenEntryFields } from '@/core/entry-fields.js';
import { createScopedEntries } from '@/sdk/local/scoped-entries.js';
import { withDefaultShape } from '@/sdk/local/with-default-shape.js';
import {
    resetEntryStorageOverrides,
    setEntryStorage,
} from '@/core/entry-storage/registry.js';

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
    sdk: Map<string, Record<string, AnyPluginSdkMethod>>;
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
    // Drop stale plugin storages before re-registering (test setups re-run this).
    resetEntryStorageOverrides();

    for (const def of defs) {
        const identity = resolvePluginIdentity(def);
        s.identities.push(identity);

        for (const { event, handler } of def.hooks ?? []) {
            if (!handler) continue;
            const list = s.hooks.get(event) ?? [];
            list.push({ identity, handler: handler as HookCallback });
            s.hooks.set(event, list);
        }

        if (def.sdk) {
            // `entries` is reserved for the Phase 3 entries sub-namespace.
            if ('entries' in def.sdk) {
                throw new Error(
                    `Astromech plugin "${def.package}" defines a reserved SDK method "entries". ` +
                        `The "entries" key is reserved for plugin entry types — rename your method.`
                );
            }
            s.sdk.set(identity.name, def.sdk);
        }

        for (const route of def.rawRoutes ?? []) {
            // `/entries` is reserved for the Phase 3 plugin entries surface.
            if (route.path === '/entries' || route.path.startsWith('/entries/')) {
                throw new Error(
                    `Astromech plugin "${def.package}" defines a raw route "${route.path}" under the ` +
                        `reserved "/entries" path. That path is reserved for plugin entry types.`
                );
            }
            s.rawRoutes.push({ identity, route });
        }

        // Register per-type custom storages under the qualified id.
        for (const [type, cfg] of pluginEntryTypes(def)) {
            if (cfg.storage) {
                setEntryStorage(qualifyEntryType(identity.name, type), cfg.storage);
            }
        }
    }
}

/**
 * Boot all plugins, in `plugins: []` order: validate `requiredEnv`, register
 * cron jobs (names auto-namespaced as `plugin:{name}:{job}`), and run
 * `setup()`. Called once at boot, after `registerPlugins`. Failures crash
 * loud, naming the plugin.
 */
export async function bootPlugins(defs: PluginDefinition[]): Promise<void> {
    const env = resolveEnv();

    for (const def of defs) {
        const identity = resolvePluginIdentity(def);

        const missing = (def.requiredEnv ?? []).filter((key) => !env[key]);
        if (missing.length > 0) {
            throw new Error(
                `Astromech plugin "${def.package}" requires missing env var(s): ` +
                    `${missing.join(', ')}. Set them in your environment or .env file.`
            );
        }

        for (const job of def.cron ?? []) {
            registerCronJob({
                name: `plugin:${identity.name}:${job.name}`,
                schedule: job.schedule,
                handler: async () => {
                    await job.handler(createPluginContext(identity, null));
                },
            });
        }

        if (def.setup) {
            try {
                await def.setup(createPluginContext(identity, null));
            } catch (error) {
                throw new Error(
                    `Astromech plugin "${def.package}" setup() failed during boot: ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                    { cause: error }
                );
            }
        }
    }
}

export function getPluginIdentities(): ResolvedPluginIdentity[] {
    return state().identities;
}

/** Whether any plugin subscribes to an event — lets callers skip hook setup work. */
export function hasHookHandlers(event: string): boolean {
    return (state().hooks.get(event)?.length ?? 0) > 0;
}

/** Resolved identity for a plugin by its access key. */
export function getPluginIdentity(name: string): ResolvedPluginIdentity | undefined {
    return state().identities.find((identity) => identity.name === name);
}

export function getPluginSdkMethods(): Map<string, Record<string, AnyPluginSdkMethod>> {
    return state().sdk;
}

export function getPluginRawRoutes(): RegisteredRawRoute[] {
    return state().rawRoutes;
}

export type PluginEntryMount = {
    identity: ResolvedPluginIdentity;
    entryTypes: Record<string, ResolvedEntryTypeConfig>;
};

/**
 * The plugin identities that contribute entry types, paired with the resolved
 * config so the API layer can mount a per-plugin entries router. Returns an
 * empty list when config has not been registered. Mirrors `getPluginRawRoutes`:
 * read once at router-build time, after `registerPlugins`.
 */
export function getPluginEntryMounts(): PluginEntryMount[] {
    const s = state();
    if (!s.config) return [];
    const mounts: PluginEntryMount[] = [];
    for (const identity of s.identities) {
        const entryTypes = s.config.pluginEntries[identity.name];
        if (entryTypes && Object.keys(entryTypes).length > 0) {
            mounts.push({ identity, entryTypes });
        }
    }
    return mounts;
}

/** Set by the local SDK at module load to break the import cycle. */
export function setPluginSdkClient(client: AstromechClient): void {
    state().sdkClient = client;
}

/** The registered SDK client, or crash-loud if a context reaches for it too early. */
function requireSdkClient(): AstromechClient {
    const client = state().sdkClient;
    if (!client) {
        throw new Error(
            '[Astromech] Plugin SDK client is not available in this context.'
        );
    }
    return client;
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
            (import.meta as unknown as { env?: Record<string, string | undefined> })
                .env ?? {};
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
                    flattenEntryFields(entryType.fields).some(
                        (field) => field.name === fieldName
                    )
                )
                .map(([name]) => name);
        },
    };
}

async function sendEmail(
    to: string,
    subject: string,
    element: ReactElement
): Promise<void> {
    const emailConfig = getEmailConfig();
    if (!emailConfig) {
        throw new Error(
            '[Astromech] Email is not configured; cannot send from a plugin.'
        );
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
            return requireSdkClient();
        },
        get entries(): EntriesApi {
            // Auto-scoped to this plugin's own entry types: bare keys in, qualified
            // ids out. Default shape is `full` (privileged server RMW context, per
            // spec §7.1 decision 7). An explicit per-call `full` still wins.
            return createScopedEntries(
                identity.name,
                withDefaultShape(
                    requireSdkClient().entries as unknown as EntriesApi,
                    'full'
                )
            );
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
        pluginEntries: {},
        adminPages: [],
        trash: { enabled: true, retentionDays: 30 },
        publicSettingKeys: [],
        timezone: 'UTC',
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
