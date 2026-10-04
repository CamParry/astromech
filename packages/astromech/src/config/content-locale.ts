/**
 * The default content locale for a caller with no config to hand. The rule
 * itself is `defaultContentLocale` in `utilities/locale.ts`.
 */

import { getConfig } from '@/config/registry';
import { defaultContentLocale } from '@/utilities/locale';

/**
 * `defaultContentLocale` for a caller with no config to hand: the transports,
 * and the repository factories' fallback when built without one.
 */
export function getDefaultContentLocale(): string {
    return defaultContentLocale(getConfig());
}
