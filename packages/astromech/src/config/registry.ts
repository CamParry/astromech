/**
 * Holds the resolved config for the process, set once during boot. Readers take
 * it from here at call time rather than importing `virtual:astromech/config`.
 */

import { createRegistry } from '@/utilities/registry';
import type { ResolvedConfig } from '@/types/index';

const config = createRegistry<ResolvedConfig>('config', {
    hint: 'Ensure createAstromech({ config }) has run before reading config.',
});

export const setConfig = config.set;
export const getConfig = config.get;
