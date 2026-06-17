import type { ImageDriver } from '@/types/index.js';

export type ResolvedImageConfig = {
    driver: ImageDriver;
    widths: number[];
    avif: boolean;
    mediaRoute: string;
};

declare global {
    var __astromechImageConfig: ResolvedImageConfig | undefined;
}

export function setImageConfig(c: ResolvedImageConfig): void {
    globalThis.__astromechImageConfig = c;
}

export function getImageConfig(): ResolvedImageConfig | null {
    return globalThis.__astromechImageConfig ?? null;
}
