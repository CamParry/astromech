import { createRegistry } from '@/utilities/registry.js';
import type { ImageDriver } from '@/types/index.js';

export type ResolvedImageConfig = {
    driver: ImageDriver;
    widths: number[];
    avif: boolean;
    mediaRoute: string;
};

/** Optional — no image driver means originals are served unchanged. */
const image = createRegistry<ResolvedImageConfig>('image', { required: false });

export const setImageConfig = image.set;
export const getImageConfig = image.peek;
