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
import { stopwatch } from '@/utilities/timing';

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

// A `globalThis` registry rather than a module-level variable: the package ships
// two tsup builds and six `exports` subpaths that can resolve to `src` or `dist`,
// so one module can be instantiated more than once. See `utilities/registry.ts`.
const registry = createRegistry<Registered>('astromech', { required: false });

/**
 * Initialise. The slot is filled synchronously with the in-flight promise, so a
 * concurrent second caller never starts a second boot. A second call with the
 * same config returns the existing instance and a different one throws — a
 * Worker exports `fetch` and `scheduled` from one isolate and either can be
 * first. A failed boot clears the slot, so the next caller retries.
 */
export function createAstromech(options: {
    config: AstromechConfig;
}): Promise<Astromech> {
    const existing = registry.peek();
    if (existing !== null) {
        if (existing.config !== options.config) {
            throw new Error(
                '[Astromech] createAstromech() was called with a different config than ' +
                    'the one this process was created with. A process holds one application.'
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

/** The created application. Never creates one; throws when none exists. */
export function getAstromech(): Promise<Astromech> {
    const existing = registry.peek();
    if (existing === null) {
        throw new Error(
            '[Astromech] no application has been created. An integration calls ' +
                'createAstromech({ config }) before anything reads the app.'
        );
    }
    return existing.app;
}

/** Resolve the config, register everything, boot the plugins, assemble the app. */
async function build(config: AstromechConfig): Promise<Astromech> {
    const clock = stopwatch();
    const plugins = config.plugins ?? [];
    const db = config.db.getInstance();

    const resolved = await clock.step('resolve config', () => {
        const c = resolveConfig(config);
        setConfig(c);
        return c;
    });
    await clock.step('register drivers', () => registerDrivers(config, db));
    await clock.step('register jobs', () => registerBuiltInEntryJobs());
    await clock.step('check migrations', () => checkMigrationDrift(db, plugins));
    await clock.step('register plugins', () => registerPluginRuntime(config, resolved));
    await clock.step('boot plugins', () => bootPlugins(plugins));

    const http = createHttpApp(resolved);

    // stderr, because the MCP server owns stdout for JSON-RPC.
    console.error(`[astromech] ready in ${clock.summary()}`);

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
