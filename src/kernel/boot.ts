/**
 * Runtime boot — registry wiring, migrations, and scheduler start.
 *
 * Pure functions extracted from the Astro integration so the same
 * boot sequence can be driven by any adapter (Astro, Cloudflare, Node,
 * tests) without pulling in Astro types.
 */

import { fileURLToPath } from 'node:url';
import type { AstromechConfig, ResolvedConfig } from '@/types/index.js';
import { setDb, getDb } from '@/db/registry.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setImageConfig } from '@/media/serving/image/registry.js';
import { normaliseWidths } from '@/media/serving/image/url.js';
import { defaultImageWidths } from '@/media/serving/image/defaults.js';
import { setEmailConfig } from '@/email/registry.js';
import { registerBuiltInEntryJobs } from '@/entries/index.js';
import { setSchedulerDriver, getSchedulerDriver } from '@/cron/registry.js';
import { nodeDriver } from '@/cron/drivers/index.js';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime.js';
import { onTick } from '@/cron/runner.js';

export async function initRuntime(
    config: AstromechConfig,
    resolvedConfig: ResolvedConfig
): Promise<void> {
    setDb(config.db.getInstance());
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
    registerPlugins(config.plugins ?? [], resolvedConfig);
    await bootPlugins(config.plugins ?? []);

    process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute;
}

export async function runMigrations(logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
}): Promise<void> {
    try {
        const { migrate } = await import('drizzle-orm/libsql/migrator');
        // dist/kernel/boot.js — go up two levels to reach package root drizzle/
        const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
        await migrate(getDb(), { migrationsFolder });
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
