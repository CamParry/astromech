/**
 * Shim for virtual:astromech/plugins/components under vitest.
 *
 * The admin plugin-field/page machinery imports lazy plugin renderers from
 * `virtual:astromech/plugins/components`, injected by the Astro integration at
 * build time. Under vitest there is no integration, so the vitest config aliases
 * that specifier here with empty registries (no plugins under test).
 */
import type * as PluginComponents from 'virtual:astromech/plugins/components';

export const fieldTypes = {} as Record<string, never>;
export const pages = {} as Record<string, never>;
export const hostPages = {} as Record<string, never>;
export const i18n = {} as Record<string, never>;

/** Every valid slot name is present and empty; a test pushes its own contributions. */
export const slots: typeof PluginComponents.slots = {
    'global-overlay': [],
    'right-drawer': [],
    toolbar: [],
};
