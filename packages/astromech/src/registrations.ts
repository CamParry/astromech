/**
 * The registration steps the create sequence runs: fill the driver slots the
 * domains read, and register the plugin runtime (ports, plugins, manifest).
 */

import type { Kysely } from 'kysely';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import type { DB } from '@/database/types';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { setDb } from '@/database/registry';
import { setDatabaseDriver } from '@/database/driver-registry';
import { setStorageDriver } from '@/storage/registry';
import { setImageConfig } from '@/media/serving/image/registry';
import { defaultImageWidths, normaliseWidths } from '@/utilities/image-widths';
import { setEmailDriver } from '@/email/registry';
import { setAIConfig } from '@/ai/registry';
import { buildAIConfig } from '@/ai/middleware';
import { setEntryAccess } from '@/entries/plugin-access';
import { setNotifyAccess } from '@/notifications/plugin-access';
import { setPluginAccess } from '@/plugin-access';
import { resolveSchedulerDriver, setSchedulerDriver } from '@/cron/registry';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { entryAccess } from '@/plugins/runtime/entry-access';

/** Fill every driver slot the domains read. */
export async function registerDrivers(
    config: AstromechConfig,
    db: Kysely<DB>
): Promise<void> {
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

    setSchedulerDriver(resolveSchedulerDriver(config.scheduler));
}

/**
 * Register the plugin runtime: bind the ports plugins reach the domains through,
 * index their methods, and record the manifest those methods dispatch from.
 */
export function registerPluginRuntime(
    config: AstromechConfig,
    resolved: ResolvedConfig
): void {
    setEntryAccess();
    setNotifyAccess();
    setPluginAccess();
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
