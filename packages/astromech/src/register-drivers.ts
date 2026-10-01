/**
 * Puts the drivers a config names into the registries the modules read them
 * from. Boot calls it, and so does the test harness, so both wire one way.
 */

import type { AstromechConfig } from '@/types/index';
import { resolveSchedulerDriver, setSchedulerDriver } from '@/cron/registry';
import { setDatabaseDriver } from '@/database/driver-registry';
import { setDb } from '@/database/registry';
import { setEmailDriver } from '@/email/registry';
import { defaultImageWidths, normaliseWidths } from '@/media/image-widths';
import { setImageConfig } from '@/media/serving/image/registry';
import { setStorageDriver } from '@/storage/registry';

/**
 * Register the config's database, storage, image, email and scheduler drivers.
 * An optional driver the config leaves out is left unset. AI models are built
 * asynchronously, so boot registers them itself.
 */
export function registerDrivers(config: AstromechConfig): void {
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
    if (config.email) setEmailDriver(config.email);
    setSchedulerDriver(resolveSchedulerDriver(config.scheduler));
}
