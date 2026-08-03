/**
 * Runtime boot — registry wiring, migrations, and scheduler start.
 *
 * Pure functions extracted from the Astro integration so the same
 * boot sequence can be driven by any adapter (Astro, Cloudflare, Node,
 * tests) without pulling in Astro types.
 */

import type {
    AstromechConfig,
    MethodManifest,
    PluginDefinition,
    ResolvedConfig,
} from '@/types/index.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { setMethodManifest } from '@/codegen/manifest-registry.js';
import { setDb, getDb } from '@/database/registry.js';
import { migrateToLatest, mergeMigrationProviders } from '@astromech/schema-engine';
import { collectPluginMigrations } from '@/database/plugin-migrations.js';
import { loadAppMigrations } from '@/database/app-migrations.js';
import { setDatabaseDriver } from '@/database/driver-registry.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setImageConfig } from '@/media/serving/image/registry.js';
import { normaliseWidths } from '@/media/serving/image/url.js';
import { defaultImageWidths } from '@/media/serving/image/defaults.js';
import { setEmailConfig } from '@/email/registry.js';
// Import from the jobs sub-barrel, NOT @/entries/index.js: the main barrel
// re-exports the entries service, whose top-level `virtual:astromech/config`
// import would be pulled into the Astro integration and crash config load
// (the integration is loaded in plain Node, where `virtual:` doesn't resolve).
import { registerBuiltInEntryJobs } from '@/entries/jobs/index.js';
// Wire the entries-domain implementation into the plugin runtime's entry-access
// port BEFORE registerPlugins runs. Like the jobs sub-barrel above, this module
// is service-free, so the integration's plain-Node config load stays safe.
import { wireEntryAccess } from '@/entries/plugin-access.js';
import { registerDocumentValidators } from '@/fields/document-validators.js';
import {
    setSchedulerDriver,
    getSchedulerDriver,
    setRuntimeConfig,
} from '@/cron/registry.js';
import { nodeDriver } from '@/cron/drivers/index.js';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime.js';
import { onTick } from '@/cron/runner.js';

export async function initRuntime(
    config: AstromechConfig,
    resolvedConfig: ResolvedConfig
): Promise<void> {
    setDb(config.db.getInstance());
    setDatabaseDriver(config.db);
    setStorageDriver(config.storage);
    if (config.image) {
        setImageConfig({
            driver: config.image.driver,
            widths: normaliseWidths(config.image.widths ?? defaultImageWidths),
            avif: config.image.avif ?? true,
            mediaRoute: resolvedConfig.mediaRoute,
        });
    }
    if (config.email) {
        setEmailConfig(config.email);
    }
    registerBuiltInEntryJobs();
    setSchedulerDriver(config.scheduler ?? nodeDriver);
    // Stash the resolved config so the cron runner reads it from the registry
    // instead of importing `virtual:astromech/config` (which the plain-Node
    // scheduler tick cannot resolve).
    setRuntimeConfig(resolvedConfig);
    wireEntryAccess();
    registerDocumentValidators(resolvedConfig);
    registerPlugins(config.plugins ?? [], resolvedConfig);
    // Generated here because this is the only runtime site holding both the
    // resolved config and the RAW plugin definitions, whose Zod input schemas
    // cannot survive the JSON the virtual config is stringified into.
    setMethodManifest(
        JSON.parse(
            generateMethodManifest(resolvedConfig, config.plugins ?? [])
        ) as MethodManifest
    );
    await bootPlugins(config.plugins ?? []);

    process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute;
}

export async function runMigrations(
    logger: {
        info: (msg: string) => void;
        error: (msg: string) => void;
    },
    plugins: PluginDefinition[]
): Promise<void> {
    try {
        // The app's CWD is where `astro dev` / `astro build` runs. db:init is
        // the primary migration path; this is belt-and-suspenders, so a failed
        // load is swallowed.
        const migrationProvider = await loadAppMigrations();
        // Plugin migrations merge into the app chain at apply time, so a newly
        // installed plugin can introduce a migration that sorts before ones
        // already applied — hence `allowUnorderedMigrations`.
        const merged = mergeMigrationProviders(
            migrationProvider,
            collectPluginMigrations(plugins)
        );
        await migrateToLatest(getDb(), merged, { allowUnorderedMigrations: true });
        logger.info('Astromech database migrations applied');
    } catch (err) {
        logger.error(
            `Astromech failed to apply migrations: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

export async function startScheduler(): Promise<void> {
    await getSchedulerDriver()?.start(onTick);
}
