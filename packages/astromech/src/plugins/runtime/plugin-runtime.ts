/**
 * Plugin runtime: holds the registry of installed plugins, builds the
 * unified PluginContext, and registers each plugin's hooks with the `hooks/`
 * leaf — a caller like any other (`DECISIONS.md`).
 */

import type { DB } from '@/database/types';
import type {
    AnyServiceMethod,
    EntriesService,
    GlobalsService,
    HookHandler,
    MediaService,
    NotificationsService,
    NotifyInput,
    PluginConfigView,
    PluginContext,
    PluginDatabase,
    PluginDefinition,
    PluginLogger,
    PluginMethods,
    PluginRawRoute,
    PluginServiceNamespace,
    ResolvedConfig,
    ResolvedPluginIdentity,
    Role,
    SettingsService,
    TypedEntriesService,
    TypedGlobalsService,
    User,
    UsersService,
} from '@/types/index';
import type { Kysely } from 'kysely';
import type { ReactElement } from 'react';
import { registerCronJob } from '@/cron/registry';
import { kyselyTableKey, registerTableCodec } from '@/database/codec';
import { getDatabaseDriver } from '@/database/driver-registry';
import { getDb } from '@/database/registry';
import { getEmailDriver } from '@/email/registry';
import { renderEmail } from '@/email/render';
import { qualifyEntryType } from '@/entries/entry-types.shared';
import {
    resetEntryRepositoryOverrides,
    setEntryRepository,
} from '@/entries/repository/registry';
import { typedEntriesService } from '@/entries/typed-entries-service';
import { getEnvRecord } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { flattenEntryFields } from '@/fields/flatten';
import { typedGlobalsService } from '@/globals/typed-globals-service';
import { addHook, clearHooks, runHook } from '@/hooks/hooks';
import { mediaService } from '@/media/service';
import { currentUserNotificationsService } from '@/notifications/current-user-service';
import { notify } from '@/notifications/service';
import {
    pluginEntryTypes,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { isTable } from '@/plugins/runtime/plugin-tables';
import { createPluginTrackingRepository } from '@/plugins/runtime/plugin-tracking-repository';
import { createRegistry } from '@/registry';
import { getCurrentRole, getCurrentUser } from '@/request-context/request-context';
import { settingsService } from '@/settings/service';
import { listAll } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { buildScopedTools } from '@/transport/tools/scoped-tools';
import { usersService } from '@/users/service';
import { log } from '@/utilities/log';
import {
    withDefaultGlobalsShape,
    withDefaultSettingsShape,
    withDefaultShape,
} from '@/utilities/with-default-shape';

// Registry lives on globalThis, shared across the package's entry chunks.
type RegisteredRawRoute = { identity: ResolvedPluginIdentity; route: PluginRawRoute };

type PluginRuntimeState = {
    config: ResolvedConfig | null;
    identities: ResolvedPluginIdentity[];
    service: Map<string, Record<string, AnyServiceMethod>>;
    rawRoutes: RegisteredRawRoute[];
};

// One registry holding all four fields rather than four registries:
// `registerPlugins` rewrites them together in a single pass.
const runtime = createRegistry<PluginRuntimeState>('pluginRuntime', {
    required: false,
});

/** The runtime state, built empty on first use. */
function state(): PluginRuntimeState {
    const existing = runtime.get();
    if (existing) return existing;
    const created: PluginRuntimeState = {
        config: null,
        identities: [],
        service: new Map(),
        rawRoutes: [],
    };
    runtime.set(created);
    return created;
}

/**
 * Index all installed plugins into the runtime registry. Called once from
 * `initRuntime`, which the injected middleware runs on the first request.
 * Identity collisions and dependencies are validated earlier in `resolveConfig`.
 */
export function registerPlugins(defs: PluginDefinition[], config: ResolvedConfig): void {
    const s = state();
    s.config = config;
    s.identities = [];
    s.service = new Map();
    s.rawRoutes = [];
    // Drop stale plugin repositories and hooks before re-registering (test setups re-run this).
    resetEntryRepositoryOverrides();
    clearHooks();

    for (const def of defs) {
        const identity = resolvePluginIdentity(def);
        s.identities.push(identity);

        // Teach the row codec about the plugin's own tables so its rows encode /
        // decode like ours. Malformed entries are skipped here —
        // `assertPluginTablePrefixes` at config-resolution time is the loud gate.
        for (const desc of def.tables ?? []) {
            if (!isTable(desc)) continue;
            registerTableCodec(kyselyTableKey(desc.name), desc);
        }

        for (const { event, handler } of def.hooks ?? []) {
            if (!handler) continue;
            addHook(event, async (payload: unknown) => {
                const [user, role] = await Promise.all([
                    getCurrentUser(),
                    getCurrentRole(),
                ]);
                return (handler as HookHandler)(
                    payload,
                    createPluginContext(identity, user, role)
                );
            });
        }

        if (def.service) s.service.set(identity.namespace, def.service);

        for (const route of def.rawRoutes ?? []) {
            s.rawRoutes.push({ identity, route });
        }

        // Register per-type custom repositories under the qualified id.
        for (const [type, entryType] of pluginEntryTypes(def)) {
            if (entryType.repository) {
                setEntryRepository(
                    qualifyEntryType(identity.namespace, type),
                    entryType.repository
                );
            }
        }
    }
}

/**
 * Boot all plugins in `plugins: []` order: validate `requiredEnv`, register
 * cron jobs, record the plugin in `_astromech_plugins`, and run `setup()`.
 * Called once at boot, after `registerPlugins`; failures crash loud, naming the plugin.
 */
export async function bootPlugins(defs: PluginDefinition[]): Promise<void> {
    const env = getEnvRecord();

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
                    await job.handler(createPluginContext(identity, null, null));
                },
            });
        }

        if (def.setup) {
            try {
                await def.setup(createPluginContext(identity, null, null));
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
 * Upsert one row in `_astromech_plugins`; `installedAt` is written once so
 * the original install time survives. Best-effort: the table may not exist
 * yet in odd dev states, and boot must not die over bookkeeping.
 */
async function trackPlugin(
    pkg: string,
    namespace: string,
    version: string
): Promise<void> {
    try {
        await createPluginTrackingRepository().track(pkg, namespace, version);
    } catch (error) {
        log.warn(
            `Could not record plugin "${pkg}" in _astromech_plugins: ` +
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
        const tracked = await createPluginTrackingRepository().packages();
        for (const pkg of tracked) {
            if (configured.includes(pkg)) continue;
            log.warn(
                `Plugin "${pkg}" is still tracked in the database but is no ` +
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

/**
 * Resolved identity for a plugin, by service key (`acmeSeo`) — the API
 * surface's addressing identifier. Not tolerant of the namespace form, since
 * `serviceKey` derives from it lossily; look up other fields off the identity.
 */
export function getPluginIdentity(
    serviceKey: string
): ResolvedPluginIdentity | undefined {
    return state().identities.find((identity) => identity.serviceKey === serviceKey);
}

export function getPluginServiceMethods(): Map<string, Record<string, AnyServiceMethod>> {
    return state().service;
}

export function getPluginRawRoutes(): RegisteredRawRoute[] {
    return state().rawRoutes;
}

function makeLogger(name: string): PluginLogger {
    const tag = `[plugin:${name}]`;
    return {
        info: (message) => console.info(`${tag} ${message}`),
        warn: (message) => console.warn(`${tag} ${message}`),
        error: (message, error) => console.error(`${tag} ${message}`, error ?? ''),
    };
}

/**
 * Project the resolved config onto the plugin view — named fields only, so a
 * live driver can never ride along on a spread.
 */
function makeConfigView(
    config: Omit<PluginConfigView, 'entryTypesWithField'>
): PluginConfigView {
    return {
        entries: config.entries,
        pluginEntries: config.pluginEntries,
        globals: config.globals,
        pluginGlobals: config.pluginGlobals,
        adminPages: config.adminPages,
        media: config.media,
        basePath: config.basePath,
        mediaRoute: config.mediaRoute,
        trash: config.trash,
        publicSettingKeys: config.publicSettingKeys,
        timezone: config.timezone,
        ...(config.admin ? { admin: config.admin } : {}),
        ...(config.users ? { users: config.users } : {}),
        ...(config.roles ? { roles: config.roles } : {}),
        ...(config.locales ? { locales: config.locales } : {}),
        ...(config.defaultLocale ? { defaultLocale: config.defaultLocale } : {}),
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

/** Backs `ctx.email.send`: render the element, then hand it to the configured driver. */
async function sendPluginEmail(
    to: string,
    subject: string,
    element: ReactElement
): Promise<void> {
    const driver = getEmailDriver();
    if (!driver) {
        throw new AstromechError('Email is not configured; cannot send from a plugin.');
    }
    const { html, text } = await renderEmail(element);
    await driver.send({ to, subject, html, text });
}

/**
 * Build the unified PluginContext for a given plugin, acting user and role.
 * `db` and every domain are lazy getters so a context can be constructed
 * before they're wired (e.g. unit tests). `clientAddress` is HTTP-transport only.
 */
export function createPluginContext(
    identity: ResolvedPluginIdentity,
    user: User | null,
    role: Role | null,
    clientAddress?: string | undefined
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
        role,
        clientAddress,
        // The domains, flattened onto the context — global services; a plugin
        // addresses its own entry types by qualified id instead of a scoping
        // wrapper. Domains with a shape axis default to 'full' (trusted server code).
        get entries(): TypedEntriesService {
            return withDefaultShape(
                typedEntriesService as unknown as EntriesService,
                'full'
            ) as unknown as TypedEntriesService;
        },
        get globals(): TypedGlobalsService {
            return withDefaultGlobalsShape(
                typedGlobalsService as unknown as GlobalsService,
                'full'
            ) as unknown as TypedGlobalsService;
        },
        // media / users / notifications have no shape axis, so they pass through.
        get media(): MediaService {
            return mediaService;
        },
        get settings(): SettingsService {
            return withDefaultSettingsShape(settingsService, 'full');
        },
        get users(): UsersService {
            return usersService;
        },
        get notifications(): NotificationsService {
            return currentUserNotificationsService;
        },
        get plugins(): PluginServiceNamespace | undefined {
            return pluginServices;
        },
        email: { send: sendPluginEmail },
        notify: (input: NotifyInput) =>
            notify({
                ...input,
                type: `plugin:${identity.namespace}.${input.type}`,
            }),
        logger: makeLogger(identity.namespace),
        get env() {
            return getEnvRecord();
        },
        runHook: (event, payload) => runHook(event, payload),
        storage: {
            put: (key, body, opts) => getStorageDriver().put(PREFIX + key, body, opts),
            get: (key) => getStorageDriver().get(PREFIX + key),
            delete: (key) => getStorageDriver().delete(PREFIX + key),
            list: async (prefix = '') =>
                (await listAll(getStorageDriver(), PREFIX + prefix)).map((k) =>
                    k.slice(PREFIX.length)
                ),
        },
        get methods(): PluginMethods {
            return {
                tools: (options) => buildScopedTools(role, options),
            };
        },
        get database(): PluginDatabase {
            // Probes rather than throws: plugin unit tests build a context
            // without ever wiring a db driver, and read `dialect` from it.
            const drv = getDatabaseDriver();
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

function emptyConfig(): Omit<PluginConfigView, 'entryTypesWithField'> {
    return {
        basePath: '/cms',
        entries: {},
        pluginEntries: {},
        globals: {},
        pluginGlobals: {},
        adminPages: [],
        trash: { enabled: true, retentionDays: 30 },
        publicSettingKeys: [],
        timezone: 'UTC',
        mediaRoute: '/_media',
        media: { access: 'public' },
    };
}
