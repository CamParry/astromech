import type { GlobalConfig } from '@/types/index';

/**
 * Define one global — a single, site-wide piece of editor-owned content — for
 * the `globals` array of a site config or a plugin definition.
 *
 * An identity function, like `defineEntryType`: `defineConfig` only type-checks
 * what is written inside the call, so a global authored in its own module gets
 * no checking until it is spread back in, and reports errors at the spread site
 * rather than at the mistake. Wrapping it here restores both.
 *
 * ```ts
 * export const site = defineGlobal({
 *     key: 'site',
 *     label: 'Site',
 *     fields: [fields.text('tagline', { label: 'Tagline' })],
 * });
 * ```
 */
export function defineGlobal(config: GlobalConfig): GlobalConfig {
    return config;
}
