/**
 * Holds the resolved config for the process, set once during boot. Readers take
 * it from here at call time rather than importing `virtual:astromech/config`.
 */

import type { ResolvedConfig } from '@/types/index';
import { createRegistry } from '@/registry';

const config = createRegistry<ResolvedConfig>('config', {
    hint: 'Ensure createAstromech({ config }) has run before reading config.',
});

export const setConfig = config.set;

/** The resolved config for the process. Throws when unset. */
export const getConfig = config.getOrThrow;
