/**
 * The default content locale — the locale a resource's rows are tagged with
 * when a call names none. Shared by every resource with per-locale content, so
 * it sits with the config it reads rather than in one resource's internals.
 */

import type { ResolvedConfig } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveContentLocale } from '@/utilities/locale';

/**
 * The content locale rows are tagged with by default, reached by walking
 * `defaultLocale` down its RFC 4647 fallback chain.
 */
export function defaultContentLocale(config: ResolvedConfig): string {
    // `defaultLocale` is a display tag (e.g. `en-GB`) and the repository matches
    // locale exactly, so fall back to the first configured locale.
    const locales = config.locales ?? [];
    const requested = config.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}

/**
 * {@link defaultContentLocale} for a caller with no config to hand: the
 * transports, and the repository factories' fallback when built without one.
 */
export function getDefaultContentLocale(): string {
    return defaultContentLocale(getConfig());
}
