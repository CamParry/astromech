/**
 * The composition root: the `Astromech` type, the `createAstromech` /
 * `getAstromech` pair, and the `build` sequence that boots a runtime —
 * resolve config, fill registries, verify schema, boot plugins, assemble.
 */

import type {
    AstromechConfig,
    ResolvedConfig,
    Role,
    TypedServices,
    User,
} from '@/types/index';
import { buildAiModels } from '@/ai/models';
import { setAiModels } from '@/ai/registry';
import { systemAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { scheduledPublishJob } from '@/content/jobs/scheduled-publish';
import { getSchedulerDriver, registerCronJob } from '@/cron/registry';
import { onTick } from '@/cron/runner';
import { setMigrationProvider } from '@/database/migration-registry';
import { checkMigrationDrift, createMergedProvider } from '@/database/migrations';
import { entryJobs } from '@/entries/jobs/entry-jobs';
import { AstromechError } from '@/errors/astromech-error';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { registerDrivers } from '@/register-drivers';
import { createRegistry } from '@/registry';
import { getCurrentRole, getCurrentUser } from '@/request-scope/request-scope';
import { typedServices } from '@/services/typed-services';
import { createHttpApp } from '@/transport/http/app';

/**
 * The application instance: every service, trusted and acting as the current
 * request (the system outside one), under the typed facades.
 */
export type Astromech = TypedServices & {
    /** The resolved, read-only config this runtime serves. */
    config: ResolvedConfig;
    /** The acting user for the current request, or null outside one. */
    getCurrentUser(): Promise<User | null>;
    /** The acting role for the current request, or null outside one. */
    getCurrentRole(): Promise<Role | null>;
    /**
     * Serve one HTTP request from the application's own routes. `remoteAddress`
     * is the connection's peer, which a Node server counts as the client.
     */
    fetch(
        request: Request,
        options?: { remoteAddress?: string | undefined }
    ): Promise<Response>;
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
 * config object returns the same instance; a different config throws. Runs
 * synchronously up to `registry.set` so a concurrent call joins the boot.
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
            'no instance of Astromech exists, createAstromech({ config }) must be called before getAstromech(). A call at module scope runs before boot, so move it into the function that uses it.'
        );
    }
    return existing.app;
}

/** Register the built-in cron jobs each domain ships. New domains add their jobs here. */
function registerBuiltInJobs(): void {
    for (const job of [scheduledPublishJob, ...entryJobs]) registerCronJob(job);
}

/** Boot a runtime: fill the registries, verify, register, boot the plugins, assemble the app. */
async function build(config: AstromechConfig): Promise<Astromech> {
    const plugins = config.plugins ?? [];
    const db = config.db.getInstance();

    // Config
    const resolved = resolveConfig(config);
    setConfig(resolved);

    // Backend registries the domains read from
    registerDrivers(config);
    if (config.ai) setAiModels(await buildAiModels(config.ai));

    // Verify the schema before anything boots against it
    await checkMigrationDrift(db, plugins, resolved.migrationsDir);
    setMigrationProvider(createMergedProvider(plugins, resolved.migrationsDir));

    // Built-in cron jobs
    registerBuiltInJobs();

    // Plugin runtime
    registerPlugins(plugins, resolved);
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
        ...typedServices(currentServices),
        getCurrentUser,
        getCurrentRole,
        fetch: async (
            request: Request,
            options?: { remoteAddress?: string | undefined }
        ): Promise<Response> =>
            http.fetch(request, { remoteAddress: options?.remoteAddress }),
        scheduled: (at?: Date): Promise<void> =>
            onTick(at ?? new Date(), systemAppContext()),
        startScheduler: async (): Promise<void> => {
            await getSchedulerDriver()?.start((now) => onTick(now, systemAppContext()));
        },
    };
}
