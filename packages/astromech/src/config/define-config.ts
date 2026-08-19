import type { AstromechConfig } from '@/types/index';

/**
 * Types the author's `astromech.config.ts` — an identity function that exists
 * for the type checking.
 */
export function defineConfig(config: AstromechConfig): AstromechConfig {
    return config;
}
