import type { Media } from '@/types/index';
import { createMediaStorage } from '../storage';
import { toMedia } from '../internal/to-media';

/** Read one media item by id, or null when there is no such row. */
export async function get(params: { id: string }): Promise<Media | null> {
    const row = await createMediaStorage().get(params.id);
    return row ? toMedia(row) : null;
}
