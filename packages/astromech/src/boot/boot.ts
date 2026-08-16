/**
 * Runtime boot — registry wiring, migrations, and scheduler start.
 *
 * Pure functions extracted from the Astro integration so the same
 * boot sequence can be driven by any adapter (Astro, Cloudflare, Node,
 * tests) without pulling in Astro types.
 */

import type { Kysely } from 'kysely';
import type {
    AstromechConfig,
    MethodManifest,
    PluginDefinition,
    ResolvedConfig,
    SchedulerDriver,
} from '@/types/index';
import type { DB } from '@/database/types';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { setDb } from '@/database/registry';
import { migrateToLatest, mergeMigrationProviders } from '@astromech/schema-engine';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { loadAppMigrations } from '@/database/app-migrations';
import { setDatabaseDriver } from '@/database/driver-registry';
import { setStorageDriver } from '@/storage/registry';
import { setImageConfig } from '@/media/serving/image/registry';
import { defaultImageWidths, normaliseWidths } from '@/utilities/image-widths';
import { setEmailDriver } from '@/email/registry';
import { setAIConfig } from '@/ai/registry';
import { buildAIConfig } from '@/ai/middleware';
// Import from the jobs sub-barrel, NOT @/entries/index.js: the main barrel
// re-exports the entries service, whose top-level `virtual:astromech/config`
// import would be pulled into the Astro integration and crash config load
// (the integration is loaded in plain Node, where `virtual:` doesn't resolve).
import { registerBuiltInEntryJobs } from '@/entries/jobs/index';
// Wire the entries-domain implementation into the plugin runtime's entry-access
// port BEFORE registerPlugins runs. Like the jobs sub-barrel above, this module
// is service-free, so the integration's plain-Node config load stays safe.
import { wireEntryAccess } from '@/entries/plugin-access';
// Same treatment for `ctx.notify`: the runtime holds a notify port, the
// notifications domain fills it. Service-free for the same reason.
import { wireNotifyAccess } from '@/notifications/plugin-access';
import {
    setSchedulerDriver,
    getSchedulerDriver,
    setRuntimeConfig,
} from '@/cron/registry';
import { cloudflareCron, interval } from '@/cron/drivers/index';
import { isWorkersRuntime } from '@/cloudflare/bindings';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime';
// The entry-access port, not `@/entries/storage/registry.js`: this module is in
// the integration's plain-Node import graph, and the registry reaches the
// built-in storage. The port has no domain imports.
import { entryAccess } from '@/plugins/runtime/entry-access';
import { onTick } from '@/cron/runner';

export async function initRuntime(
    config: AstromechConfig,
    resolvedConfig: ResolvedConfig
): Promise<void> {
    setDb(config.db.getInstance());
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
    if (config.email) {
        setEmailDriver(config.email);
    }
    if (config.ai) {
        setAIConfig(await buildAIConfig(config.ai));
    }
    registerBuiltInEntryJobs();
    setSchedulerDriver(config.scheduler ?? defaultScheduler());
    // Stash the resolved config so the cron runner reads it from the registry
    // instead of importing `virtual:astromech/config`, which it cannot: this
    // module is in the integration's plain-Node import graph and drags
    // `cron/runner.ts` in with it.
    setRuntimeConfig(resolvedConfig);
    wireEntryAccess();
    wireNotifyAccess();
    registerPlugins(config.plugins ?? [], resolvedConfig);
    // Host entry types declaring their own storage, mounted after
    // `registerPlugins` — that opens by clearing every override, so registering
    // earlier would silently wipe them. Keyed by the bare type name, which is
    // what the entries domain looks up; plugin types are qualified instead.
    for (const [type, entryType] of Object.entries(config.entries)) {
        if (entryType.storage) entryAccess().setEntryStorage(type, entryType.storage);
    }
    // Generated here because this is the only runtime site holding both the
    // resolved config and the raw `PluginDefinition[]`, which `ResolvedConfig`
    // strips and only `rawConfig` carries.
    setMethodManifest(
        JSON.parse(
            generateMethodManifest(resolvedConfig, config.plugins ?? [])
        ) as MethodManifest
    );
    await bootPlugins(config.plugins ?? []);
}

export async function runMigrations(
    db: Kysely<DB>,
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
        await migrateToLatest(db, merged, { allowUnorderedMigrations: true });
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

/**
 * The scheduler used when the config names none. On Workers, platform cron
 * fires `scheduled()` and a Worker must not own a timer, so the no-op
 * Cloudflare driver stands in for the in-process ticker.
 */
export function defaultScheduler(): SchedulerDriver {
    return isWorkersRuntime() ? cloudflareCron() : interval();
}
