/**
 * The Astromech application — one front door to a booted runtime.
 *
 * `createAstromech` initialises and `getAstromech` only ever reads, so there is
 * exactly one place a runtime starts. The create sequence lives here: resolve
 * the config, register the drivers and plugin runtime, boot the plugins, then
 * assemble the instance.
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
import { AstromechError } from '@/errors/index';
import { getCurrentRole, getCurrentUser } from '@/request-context/index';
import { registerDrivers, registerPluginRuntime } from '@/registrations';
import { checkMigrationDrift } from '@/database/migrations';
import { getSchedulerDriver } from '@/cron/registry';
import { onTick } from '@/cron/runner';
import { resolveConfig } from '@/config/resolve';
import { setConfig } from '@/config/registry';
import { registerBuiltInEntryJobs, typedEntriesService } from '@/entries/index';
import { mediaService } from '@/media/index';
import { currentUserNotificationsService } from '@/notifications/index';
import { settingsService } from '@/settings/index';
import { usersService } from '@/users/index';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { bootPlugins } from '@/plugins/runtime/plugin-runtime';
import { createHttpApp } from '@/transport/http/index';
import { createRegistry } from '@/utilities/registry';

export type Astromech = {
    config: ResolvedConfig;
    entries: TypedEntriesService;
    media: MediaService;
    users: UsersService;
    settings: SettingsService;
    notifications: NotificationsService;
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

type Registered = { config: AstromechConfig; app: Promise<Astromech> };

// The global registry to hold the Astromech instance.
const registry = createRegistry<Registered>('astromech', { required: false });

/**
 * Creates the global Astromech instance and returns it.
 * Subsequent calls return the existing instance or
 * throws if called with a different config.
 */
export function createAstromech(options: {
    config: AstromechConfig;
}): Promise<Astromech> {
    const existing = registry.peek();
    if (existing !== null) {
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
    const existing = registry.peek();
    if (existing === null) {
        throw new AstromechError(
            'no instance of Astromech exists, createAstromech({ config }) must be called before getAstromech()'
        );
    }
    return existing.app;
}

/** Resolve the config, register everything, boot the plugins, assemble the app. */
async function build(config: AstromechConfig): Promise<Astromech> {
    const plugins = config.plugins ?? [];
    const db = config.db.getInstance();

    const resolved = resolveConfig(config);
    setConfig(resolved);

    await registerDrivers(config, db);
    registerBuiltInEntryJobs();
    await checkMigrationDrift(db, plugins);
    registerPluginRuntime(config, resolved);
    await bootPlugins(plugins);

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
