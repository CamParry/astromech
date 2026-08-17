/**
 * The boot phases, in order, each timed:
 * resolve config → register drivers → register plugins → boot plugins → ready.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { setDb } from '@/database/registry';
import { setDatabaseDriver } from '@/database/driver-registry';
import { checkMigrationDrift } from '@/boot/migrations';
import { setStorageDriver } from '@/storage/registry';
import { setImageConfig } from '@/media/serving/image/registry';
import { defaultImageWidths, normaliseWidths } from '@/utilities/image-widths';
import { setEmailDriver } from '@/email/registry';
import { setAIConfig } from '@/ai/registry';
import { buildAIConfig } from '@/ai/middleware';
import { registerBuiltInEntryJobs } from '@/entries/jobs/index';
import { wireEntryAccess } from '@/entries/plugin-access';
import { wireNotifyAccess } from '@/notifications/plugin-access';
import { resolveSchedulerDriver, setSchedulerDriver } from '@/cron/registry';
import { bootPlugins, registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { entryAccess } from '@/plugins/runtime/entry-access';

export type BootPhase =
    | 'resolve config'
    | 'register drivers'
    | 'register plugins'
    | 'boot plugins'
    | 'ready';

/** Run every phase in order and report the resolved config the app is built on. */
export async function runBootPhases(config: AstromechConfig): Promise<ResolvedConfig> {
    const timings: string[] = [];
    const started = Date.now();

    async function phase<T>(name: BootPhase, run: () => Promise<T> | T): Promise<T> {
        const from = Date.now();
        const result = await run();
        timings.push(`${name} ${Date.now() - from}ms`);
        return result;
    }

    const resolved = await phase('resolve config', () => resolvePhase(config));
    await phase('register drivers', () => registerDrivers(config));
    await phase('register plugins', () => registerPluginRuntime(config, resolved));
    await phase('boot plugins', () => bootPlugins(config.plugins ?? []));

    // stderr, because the MCP server owns stdout for JSON-RPC.
    console.error(
        `[astromech] ready in ${Date.now() - started}ms (${timings.join(', ')})`
    );
    return resolved;
}

/** Resolve the author's config once and publish it to the registries. */
function resolvePhase(config: AstromechConfig): ResolvedConfig {
    const resolved = resolveConfig(config);
    setConfig(resolved);
    return resolved;
}

/** Fill every driver slot the domains read, then report migration drift. */
async function registerDrivers(config: AstromechConfig): Promise<void> {
    const db = config.db.getInstance();
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
    if (config.email) {
        setEmailDriver(config.email);
    }
    if (config.ai) {
        setAIConfig(await buildAIConfig(config.ai));
    }

    registerBuiltInEntryJobs();
    setSchedulerDriver(resolveSchedulerDriver(config.scheduler));
    await checkMigrationDrift(db, config.plugins ?? []);
}

/**
 * Register the plugins: bind the ports they reach the domains through, index
 * their methods, and record the manifest those methods are dispatched from.
 */
function registerPluginRuntime(config: AstromechConfig, resolved: ResolvedConfig): void {
    wireEntryAccess();
    wireNotifyAccess();
    registerPlugins(config.plugins ?? [], resolved);

    // Host entry types declaring their own storage, mounted after
    // `registerPlugins` because that opens by clearing every override. Keyed by
    // the bare type name; plugin types are qualified instead.
    for (const [type, entryType] of Object.entries(config.entries)) {
        if (entryType.storage) entryAccess().setEntryStorage(type, entryType.storage);
    }

    // Generated here because this is the only runtime site holding both the
    // resolved config and the raw `PluginDefinition[]`, which `ResolvedConfig`
    // strips and only the author's config carries.
    setMethodManifest(generateMethodManifest(resolved, config.plugins ?? []));
}
