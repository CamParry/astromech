/**
 * The composition root: the `Astromech` type, the `createAstromech` /
 * `getAstromech` pair, the process-wide instance registry, and the `build`
 * sequence that boots a runtime.
 *
 * `createAstromech` boots and registers the instance; `getAstromech` only reads
 * it — one instance per process. `build` runs the sequence: resolve the config,
 * register the backends and plugin runtime, boot the plugins, assemble the app.
 */

import type {
    AstromechConfig,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    ResolvedConfig,
    Role,
    SettingsService,
    TypedEntriesService,
    User,
    UsersService,
} from '@/types/index';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { getSchedulerDriver } from '@/cron/registry';
import { onTick } from '@/cron/runner';
import { checkMigrationDrift } from '@/database/migrations';
import { typedEntriesService } from '@/entries/index';
import { AstromechError } from '@/errors/index';
import { mediaService } from '@/media/index';
import { currentUserNotificationsService } from '@/notifications/index';
import { bootPlugins } from '@/plugins/runtime/plugin-runtime';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import {
    registerBackends,
    registerBuiltInJobs,
    registerPluginRuntime,
} from '@/registrations';
import { getCurrentRole, getCurrentUser } from '@/request-context/index';
import { settingsService } from '@/settings/index';
import { createHttpApp } from '@/transport/http/index';
import { usersService } from '@/users/index';
import { createRegistry } from '@/utilities/registry';

export type Astromech = {
    /** The resolved, read-only config this runtime serves. */
    config: ResolvedConfig;
    /** Typed read and write access to the entry types. */
    entries: TypedEntriesService;
    /** Media items: store, transform, and serve. */
    media: MediaService;
    /** Users, roles, and authentication. */
    users: UsersService;
    /** Settings resources. */
    settings: SettingsService;
    /** Notifications for the acting user. */
    notifications: NotificationsService;
    /** The services each installed plugin exposes, namespaced by plugin. */
    plugins: PluginServiceNamespace;
    /** The acting user for the current request, or null outside one. */
    getCurrentUser(): Promise<User | null>;
    /** The acting role for the current request, or null outside one. */
    getCurrentRole(): Promise<Role | null>;
    /** Serve one HTTP request from the application's own routes. */
    fetch(request: Request): Promise<Response>;
    /** Run the cron jobs due at `at`. Defaults to now. */
    scheduled(at?: Date): Promise<void>;
    /** The serving integration's terminal action. Idempotent. No-op on Workers. */
    startScheduler(): Promise<void>;
};

type Registered = {
    /** The authored config, kept only to detect a second create with a different one. */
    config: AstromechConfig;
    app: Promise<Astromech>;
};

// The process-wide slot holding the one Astromech instance.
const registry = createRegistry<Registered>('astromech', { required: false });

/**
 * Boots the Astromech instance and returns it. A later call with the same
 * config object returns the same instance; a call with a different config
 * throws — one config per process.
 *
 * Runs synchronously up to `registry.set`, registering the in-flight promise
 * before it yields, so a second call arriving during boot joins that boot
 * rather than starting a second one.
 */
export function createAstromech(options: {
    config: AstromechConfig;
}): Promise<Astromech> {
    const existing = registry.tryGet();
    if (existing !== null) {
        // Identity, not deep equality: two different config objects mean two
        // different intended configs, which is the mistake this guard surfaces.
        if (existing.config !== options.config) {
            throw new AstromechError(
                'createAstromech() cannot be called again with a different config'
            );
        }
        return existing.app;
    }

    const app = build(options.config).catch((error: unknown) => {
        registry.clear();
        throw error;
    });
    registry.set({ config: options.config, app });
    return app;
}

/** Gets the global Astromech instance. Throws if it does not exist. */
export function getAstromech(): Promise<Astromech> {
    const existing = registry.tryGet();
    if (existing === null) {
        throw new AstromechError(
            'no instance of Astromech exists, createAstromech({ config }) must be called before getAstromech()'
        );
    }
    return existing.app;
}

/** Resolve the config, register the backends and plugin runtime, boot the plugins, assemble the app. */
async function build(config: AstromechConfig): Promise<Astromech> {
    const plugins = config.plugins ?? [];
    const db = config.db.getInstance();

    // Config
    const resolved = resolveConfig(config);
    setConfig(resolved);

    // Backends the domains read from
    await registerBackends(config, db);

    // Verify the schema before anything boots against it
    await checkMigrationDrift(db, plugins);

    // Registrations
    registerBuiltInJobs();
    registerPluginRuntime(config, resolved);

    // Boot
    await bootPlugins(plugins);

    // Assemble
    const http = createHttpApp(resolved);

    return {
        config: resolved,
        entries: typedEntriesService,
        media: mediaService,
        users: usersService,
        settings: settingsService,
        notifications: currentUserNotificationsService,
        plugins: pluginServices,
        getCurrentUser,
        getCurrentRole,
        fetch: async (request: Request): Promise<Response> => http.fetch(request),
        scheduled: (at?: Date): Promise<void> => onTick(at ?? new Date()),
        startScheduler: async (): Promise<void> => {
            await getSchedulerDriver()?.start(onTick);
        },
    };
}
