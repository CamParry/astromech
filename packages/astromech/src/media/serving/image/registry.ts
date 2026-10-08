import type { ImageDriver } from '@/media/serving/image/driver';
import { createRegistry } from '@/registry';

export type ResolvedImageConfig = {
    driver: ImageDriver;
    widths: number[];
    avif: boolean;
};

/** Optional — no image driver means originals are served unchanged. */
const image = createRegistry<ResolvedImageConfig>('image', { required: false });

export const setImageConfig = image.set;
export const getImageConfig = image.get;
