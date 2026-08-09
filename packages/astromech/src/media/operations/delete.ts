import { getStorageDriver } from '@/storage/registry';
import { deletePrefix } from '@/storage/prefix';
import { createMediaStorage } from '../storage';
import { originalKey } from '../internal/keys';
import { variantPrefix } from '../serving/image/url.shared';

/** Delete a media row along with its original bytes and every derived variant. */
export async function deleteMedia(params: { id: string }): Promise<void> {
    const { id } = params;
    const storage = createMediaStorage();
    const driver = getStorageDriver();

    const row = await storage.get(id);
    if (row) {
        await driver.delete(originalKey(row.id, row.filename));
        await deletePrefix(driver, variantPrefix(id));
    }

    await storage.delete(id);
}
