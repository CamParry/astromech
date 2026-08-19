/**
 * The composition root: the `Astromech` type, the `createAstromech` /
 * `getAstromech` pair, the process-wide instance registry, and the `build`
 * sequence that boots a runtime.
 *
 * `createAstromech` boots and registers the instance; `getAstromech` only reads
 * it — one instance per process. `build` runs the whole sequence inline, in the
 * order it happens: resolve the config, fill the backend registries, verify the
 * schema, register the jobs and plugin runtime, boot the plugins, assemble.
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
import { buildAiConfig } from '@/ai/middleware';
import { setAiConfig } from '@/ai/registry';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import {
    getSchedulerDriver,
    registerCronJob,
    resolveSchedulerDriver,
    setSchedulerDriver,
} from '@/cron/registry';
import { onTick } from '@/cron/runner';
import { setDatabaseDriver } from '@/database/driver-registry';
import { checkMigrationDrift } from '@/database/migrations';
import { setDb } from '@/database/registry';
import { setEmailDriver } from '@/email/registry';
import { entryJobs, typedEntriesService } from '@/entries/index';
import { setEntryRepository } from '@/entries/repository/registry';
import { AstromechError } from '@/errors/index';
import { defaultImageWidths, normaliseWidths } from '@/media/image-widths.shared';
import { mediaService } from '@/media/index';
import { setImageConfig } from '@/media/serving/image/registry';
import { currentUserNotificationsService } from '@/notifications/index';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { createRegistry } from '@/registry';
import { getCurrentRole, getCurrentUser } from '@/request-context/index';
import { settingsService } from '@/settings/index';
import { setStorageDriver } from '@/storage/registry';
import { createHttpApp } from '@/transport/http/index';
import { usersService } from '@/users/index';

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

// The process-wide registry holding the one Astromech instance.
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
    const existing = registry.get();
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
    const existing = registry.get();
    if (existing === null) {
        throw new AstromechError(
            'no instance of Astromech exists, createAstromech({ config }) must be called before getAstromech()'
        );
    }
    return existing.app;
}

/** Register the built-in cron jobs each domain ships. New domains add their jobs here. */
function registerBuiltInJobs(): void {
    for (const job of entryJobs) registerCronJob(job);
}

/** Boot a runtime: fill the registries, verify, register, boot the plugins, assemble the app. */
async function build(config: AstromechConfig): Promise<Astromech> {
    const plugins = config.plugins ?? [];
    const db = config.db.getInstance();

    // Config
    const resolved = resolveConfig(config);
    setConfig(resolved);

    // Backend registries the domains read from
    setDb(db);
    setDatabaseDriver(config.db);
    setStorageDriver(config.storage);
    const image = config.media?.image;
    if (image) {
        setImageConfig({
            driver: image.driver,
            widths: normaliseWidths(image.widths ?? defaultImageWidths),
            avif: image.avif ?? true,
        });
    }
    if (config.email) setEmailDriver(config.email);
    if (config.ai) setAiConfig(await buildAiConfig(config.ai));
    setSchedulerDriver(resolveSchedulerDriver(config.scheduler));

    // Verify the schema before anything boots against it
    await checkMigrationDrift(db, plugins);

    // Built-in cron jobs
    registerBuiltInJobs();

    // Plugin runtime
    registerPlugins(plugins, resolved);
    // Host entry types declaring their own storage, mounted after
    // `registerPlugins` because that opens by clearing every override. Keyed by
    // the bare type name; plugin types are qualified instead.
    for (const [type, entryType] of Object.entries(config.entries)) {
        if (entryType.repository) setEntryRepository(type, entryType.repository);
    }
    // The method manifest those plugins dispatch from, generated here because
    // this is the only site holding both the resolved config and the raw
    // `PluginDefinition[]`, which `ResolvedConfig` strips.
    setMethodManifest(generateMethodManifest(resolved, plugins));

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
