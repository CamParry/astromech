/**
 * Plugin runtime.
 *
 * Holds the registry of installed plugins (hooks / service / raw routes),
 * builds the unified PluginContext, and runs hooks with the documented failure
 * semantics: `before*` hooks gate the operation (a throw aborts), `after*`
 * hooks and emitted events are swallow-and-logged (a throw never rolls back).
 *
 * Config is injected via `registerPlugins` rather than imported from
 * `virtual:astromech/config`, so this module stays unit-testable.
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB } from '@/database/types.js';
import type { ReactElement } from 'react';
import type {
    AnyPluginServiceMethod,
    AstromechClient,
    EntriesApi,
    MediaApi,
    NotificationsApi,
    PluginContext,
    PluginConfigView,
    PluginDatabase,
    PluginDefinition,
    PluginLogger,
    PluginRawRoute,
    PluginServiceNamespace,
    ResolvedConfig,
    ResolvedPluginIdentity,
    SettingsApi,
    TypedEntriesApi,
    User,
    UsersApi,
} from '@/types/index.js';
import { getDb } from '@/database/registry.js';
import {
    encode,
    encodePatch,
    kyselyTableKey,
    registerDescriptorCodec,
} from '@/database/codec.js';
import { peekDatabaseDriver } from '@/database/driver-registry.js';
import { getStorageDriver } from '@/storage/registry.js';
import { listAll } from '@/storage/prefix.js';
import { getEmailConfig } from '@/email/registry.js';
import { renderEmail } from '@/email/render.js';
import { notify } from '@/notifications/index.js';
import type { NotifyInput } from '@/types/index.js';
import {
    pluginEntryTypes,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity.js';
import { entryAccess } from '@/plugins/runtime/entry-access.js';
import { isTableDescriptor } from '@/plugins/runtime/plugin-schema.js';
import { registerCronJob } from '@/cron/registry.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import {
    withDefaultShape,
    withDefaultSettingsShape,
} from '@/utilities/with-default-shape.js';

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
    service: Map<string, Record<string, AnyPluginServiceMethod>>;
    rawRoutes: RegisteredRawRoute[];
    client: AstromechClient | null;
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
            service: new Map(),
            rawRoutes: [],
            client: null,
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
    s.service = new Map();
    s.rawRoutes = [];
    // Drop stale plugin storages before re-registering (test setups re-run this).
    entryAccess().resetEntryStorageOverrides();

    for (const def of defs) {
        const identity = resolvePluginIdentity(def);
        s.identities.push(identity);

        // Teach the row codec about the plugin's own tables so its rows encode /
        // decode like ours. Malformed entries are skipped here —
        // `assertPluginTablePrefixes` at config-resolution time is the loud gate.
        for (const desc of def.schema ?? []) {
            if (!isTableDescriptor(desc)) continue;
            registerDescriptorCodec(kyselyTableKey(desc.name), desc);
        }

        for (const { event, handler } of def.hooks ?? []) {
            if (!handler) continue;
            const list = s.hooks.get(event) ?? [];
            list.push({ identity, handler: handler as HookCallback });
            s.hooks.set(event, list);
        }

        // `entries` used to be reserved on both the service map and the
        // raw-route path — it named the per-plugin entries surface. That
        // surface is gone (entry types live on the one entries service), so
        // neither name collides with anything any more.
        if (def.service) s.service.set(identity.namespace, def.service);

        for (const route of def.rawRoutes ?? []) {
            s.rawRoutes.push({ identity, route });
        }

        // Register per-type custom storages under the qualified id.
        const access = entryAccess();
        for (const [type, cfg] of pluginEntryTypes(def)) {
            if (cfg.storage) {
                access.setEntryStorage(
                    access.qualifyEntryType(identity.namespace, type),
                    cfg.storage
                );
            }
        }
    }
}

/**
 * Boot all plugins, in `plugins: []` order: validate `requiredEnv`, register
 * cron jobs (names auto-namespaced as `plugin:{name}:{job}`), record the plugin
 * in `_astromech_plugins`, and run `setup()`. Called once at boot, after
 * `registerPlugins`. Failures crash loud, naming the plugin — except the
 * tracking writes, which are best-effort (see `trackPlugin`).
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

        await trackPlugin(def.package, identity.namespace, def.version ?? '0.0.0');

        for (const job of def.cron ?? []) {
            registerCronJob({
                name: `plugin:${identity.namespace}:${job.name}`,
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

    await warnOnUntrackedRemovals(defs.map((def) => def.package));
}

/**
 * Upsert one row in `_astromech_plugins`. `installedAt` is written once — a
 * conflict only refreshes `version`, so the original install time survives.
 *
 * Best-effort: the table may not exist yet in odd dev states (a database
 * predating the tracking migration), and boot must not die over bookkeeping.
 */
async function trackPlugin(
    pkg: string,
    namespace: string,
    version: string
): Promise<void> {
    try {
        await getDb()
            .insertInto('_astromech_plugins')
            .values(
                encode('_astromech_plugins', {
                    package: pkg,
                    namespace,
                    version,
                    installedAt: new Date(),
                }) as unknown as Insertable<DB['_astromech_plugins']>
            )
            .onConflict((oc) =>
                // `encodePatch`, not `encode`: the insert codec injects app
                // defaults, which would re-stamp `installedAt` on every boot.
                oc.column('package').doUpdateSet(
                    encodePatch('_astromech_plugins', {
                        namespace,
                        version,
                    }) as unknown as Updateable<DB['_astromech_plugins']>
                )
            )
            .execute();
    } catch (error) {
        console.warn(
            `[astromech] Could not record plugin "${pkg}" in _astromech_plugins: ` +
                `${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Warn about plugins still tracked in `_astromech_plugins` but no longer in
 * `config.plugins`: their tables and migration rows are still in the database.
 * Best-effort for the same reason as `trackPlugin`.
 */
async function warnOnUntrackedRemovals(configured: string[]): Promise<void> {
    try {
        const tracked = await getDb()
            .selectFrom('_astromech_plugins')
            .select('package')
            .execute();
        for (const row of tracked) {
            const pkg = row.package;
            if (configured.includes(pkg)) continue;
            console.warn(
                `[astromech] Plugin "${pkg}" is still tracked in the database but is no ` +
                    `longer in \`config.plugins\`. Its tables and migrations remain — run ` +
                    `\`astromech plugin:purge ${pkg}\` to remove them.`
            );
        }
    } catch {
        // Same best-effort reasoning as trackPlugin.
    }
}

export function getPluginIdentities(): ResolvedPluginIdentity[] {
    return state().identities;
}

/** Whether any plugin subscribes to an event — lets callers skip hook setup work. */
export function hasHookHandlers(event: string): boolean {
    return (state().hooks.get(event)?.length ?? 0) > 0;
}

/**
 * Resolved identity for a plugin, by service key (`acmeSeo`) — the single
 * identifier the API surface addresses a plugin by, in both transports and on
 * the wire. Deliberately NOT tolerant of the namespace form: `serviceKey` is
 * derived from `namespace` lossily (`acme_2fa` → `acme2fa`), so accepting both
 * would mean guessing an inverse that does not exist. The namespace stays
 * authoritative for tables, permissions and storage prefixes; look those up
 * through the returned identity, never by re-deriving a string.
 */
export function getPluginIdentity(
    serviceKey: string
): ResolvedPluginIdentity | undefined {
    return state().identities.find((identity) => identity.serviceKey === serviceKey);
}

export function getPluginServiceMethods(): Map<
    string,
    Record<string, AnyPluginServiceMethod>
> {
    return state().service;
}

export function getPluginRawRoutes(): RegisteredRawRoute[] {
    return state().rawRoutes;
}

/** Set by the Local API at module load to break the import cycle. */
export function setPluginClient(client: AstromechClient): void {
    state().client = client;
}

/** The registered client, or crash-loud if a context reaches for it too early. */
function requireClient(): AstromechClient {
    const client = state().client;
    if (!client) {
        throw new Error('[Astromech] Plugin client is not available in this context.');
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
 * every domain are lazy getters so a context can be constructed in environments
 * where they are not yet wired (e.g. unit tests that exercise only hook
 * semantics).
 */
export function createPluginContext(
    identity: ResolvedPluginIdentity,
    user: User | null
): PluginContext {
    const config = state().config;
    const configView = config ? makeConfigView(config) : makeConfigView(emptyConfig());
    const PREFIX = `plugin/${identity.namespace}/`;

    return {
        get db(): Kysely<DB> {
            return getDb();
        },
        plugin: identity,
        config: configView,
        user,
        // The domains, flattened onto the context. These are the global services
        // — a plugin addresses its own entry types explicitly by their qualified
        // id (`` `${ctx.plugin.namespace}/redirect` ``) rather than through a
        // scoping wrapper. Both domains with a shape axis default to `full`:
        // plugin altitude is trusted server code, and a `public` default hands it
        // sanitized rich text, stripped private fields and null private settings.
        get entries(): TypedEntriesApi {
            return withDefaultShape(
                requireClient().entries as unknown as EntriesApi,
                'full'
            ) as unknown as TypedEntriesApi;
        },
        // media / users / notifications have no shape axis, so they pass through.
        get media(): MediaApi {
            return requireClient().media;
        },
        get settings(): SettingsApi {
            return withDefaultSettingsShape(requireClient().settings, 'full');
        },
        get users(): UsersApi {
            return requireClient().users;
        },
        get notifications(): NotificationsApi {
            return requireClient().notifications;
        },
        get plugins(): PluginServiceNamespace | undefined {
            return requireClient().plugins;
        },
        sendEmail,
        notify: (input: NotifyInput) =>
            notify({ ...input, type: `plugin:${identity.namespace}.${input.type}` }),
        logger: makeLogger(identity.namespace),
        env: resolveEnv(),
        emit: (event, payload) => emitEvent(event, payload, user),
        storage: {
            put: (key, body, opts) => getStorageDriver().put(PREFIX + key, body, opts),
            get: (key) => getStorageDriver().get(PREFIX + key),
            delete: (key) => getStorageDriver().delete(PREFIX + key),
            list: async (prefix = '') =>
                (await listAll(getStorageDriver(), PREFIX + prefix)).map((k) =>
                    k.slice(PREFIX.length)
                ),
        },
        get database(): PluginDatabase {
            // Probes rather than throws: plugin unit tests build a context
            // without ever wiring a db driver, and read `dialect` from it.
            const drv = peekDatabaseDriver();
            const dialect = drv?.type ?? 'unknown';
            const dump = drv?.dump?.bind(drv);
            const restore = drv?.restore?.bind(drv);
            return {
                dialect,
                ...(dump ? { dump } : {}),
                ...(restore ? { restore } : {}),
            };
        },
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
            put: () => Promise.resolve(),
            get: () => Promise.resolve(null),
            stat: () => Promise.resolve(null),
            delete: () => Promise.resolve(),
            list: () => Promise.resolve({ keys: [] }),
        },
        mediaRoute: '/_media',
        media: { access: 'public' },
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
