/**
 * The capability vocabulary a global turns on or off, and the check that holds
 * a call to the capability its method `requires`.
 */

import type { ResolvedConfig } from '@/types/index';
import { assertCapability } from '@/content/capabilities';
import { resolveGlobal } from './resolve-global';

/** Every capability a global may declare, for narrowing a bare string to one. */
export const GLOBAL_CAPABILITIES = [
    'statuses',
    'translatable',
    'versioning',
    'staging',
] as const;

/** The capabilities a global declares. A global is never trashed and has no slug. */
export type GlobalCapability = (typeof GLOBAL_CAPABILITIES)[number];

/** Whether a method's `requires`, typed as a bare string, names a global capability. */
export function isGlobalCapability(value: string): value is GlobalCapability {
    return (GLOBAL_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Enforce the capability a method requires of the global a call's `input`
 * names. An undeclared key is left to the method, which answers it with a 404.
 */
export function assertRequiredCapability(
    config: ResolvedConfig,
    input: unknown,
    capability: string
): void {
    const key =
        typeof input === 'object' && input !== null
            ? (input as { key?: unknown }).key
            : undefined;
    const global = typeof key === 'string' ? resolveGlobal(config, key) : undefined;
    if (!global) return;
    if (!isGlobalCapability(capability)) {
        throw new Error(`'${capability}' is not a global capability.`);
    }
    assertCapability('global', global, capability);
}
