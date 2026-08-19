import type { EntryType } from '@/types/index';

/**
 * Define one entry type — the *shape* of a kind of content (its fields,
 * capabilities, admin columns and URL template), not a piece of content.
 *
 * Reach for it when an entry type outgrows its inline declaration in
 * `defineConfig` and wants its own module. Entry types are the part of a config
 * that grows without bound, and `defineConfig` only type-checks what is written
 * inside the call — so a bare object exported from another file gets no
 * checking until it is spread back in, and reports errors at the spread site
 * rather than at the mistake. Wrapping it here restores both.
 *
 * Declaring the type inline in `defineConfig` stays correct and is the right
 * default for small ones; this is the escape hatch for when a site has enough
 * of them that one file per type reads better.
 *
 * ```ts
 * // src/entries/author.ts
 * export const author = defineEntryType({
 *     single: 'Author',
 *     plural: 'Authors',
 *     fields: [fields.richtext('bio', { label: 'Bio' })],
 * });
 *
 * // astromech.config.ts
 * export default defineConfig({ entries: { author } });
 * ```
 *
 * Root-config entry types are keyed by the `entries` record and leave `type`
 * unset; a plugin's entry types self-declare `type` so they can be listed in
 * the plugin's `entries` array.
 */
export function defineEntryType(config: EntryType): EntryType {
    return config;
}
