import { deletePrefix } from '@/storage/prefix';
import { getStorageDriver } from '@/storage/registry';
import { originalKey } from '../internal/keys';
import { createMediaRepository } from '../repository';
import { variantPrefix } from '../serving/image/url.shared';

/** Delete a media row along with its original bytes and every derived variant. */
export async function deleteMedia(params: { id: string }): Promise<void> {
    const { id } = params;
    const repository = createMediaRepository();
    const driver = getStorageDriver();

    const row = await repository.get(id);
    if (row) {
        await driver.delete(originalKey(row.id, row.filename));
        await deletePrefix(driver, variantPrefix(id));
    }

    await repository.delete(id);
}
