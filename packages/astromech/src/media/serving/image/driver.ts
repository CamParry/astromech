/**
 * The image driver contract and the `media.image` setting that holds one.
 */

import type { ImageFormat } from '@/media/serving/image/url';

export type ImageSource = {
    contentType: string;
    getBytes(): Promise<Uint8Array>;
    originUrl: string;
};

export type ImageDriver = {
    name: string;
    /**
     * Names every setting that shapes the driver's output, such as its encoder
     * and quality. It joins each variant's storage key and ETag; defaults to `name`.
     */
    cacheKey?: string;
    transform(
        src: ImageSource,
        opts: { width: number; format: ImageFormat }
    ): Promise<{ body: ReadableStream | Uint8Array; contentType: string }>;
    /**
     * Whether the driver can make variants of a file of this content type. A
     * type it cannot is served as the original with no srcset; absent, it can.
     */
    canTransform?(contentType: string): Promise<boolean>;
    placeholder?(bytes: Uint8Array): Promise<string | null>;
    cachesVariants?: boolean;
};

export type ImageConfig = {
    driver: ImageDriver;
    widths?: number[];
    avif?: boolean;
};
