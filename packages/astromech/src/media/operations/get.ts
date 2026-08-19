import type { Media } from '@/types/index';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';

/** Read one media item by id, or null when there is no such row. */
export async function get(params: { id: string }): Promise<Media | null> {
    const row = await createMediaRepository().get(params.id);
    return row ? toMedia(row) : null;
}
