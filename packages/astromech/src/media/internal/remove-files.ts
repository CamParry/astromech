import type { StorageDriver } from '@/types/index';
import { deletePrefix } from '@/storage/prefix';
import { log } from '@/utilities/log';
import { variantPrefix } from '../serving/image/url';

/**
 * Remove an item's derived variants and, when given, an original it no longer
 * uses. Runs once the row write has committed or failed, so a failure is logged
 * rather than thrown and leaves at worst an orphaned file.
 */
export async function removeFiles(
    driver: StorageDriver,
    id: string,
    original: string | null
): Promise<void> {
    try {
        if (original !== null) await driver.delete(original);
        await deletePrefix(driver, variantPrefix(id));
    } catch (error) {
        log.warn(
            `Could not remove the stored files of media ${id}, which are now orphaned: ` +
                `${error instanceof Error ? error.message : String(error)}`
        );
    }
}
