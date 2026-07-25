/**
 * `definePlugin` — the scoped table factory a plugin package uses to declare
 * its own schema.
 *
 * A plugin's tables live in the same database as the app's, so they are
 * namespaced by alias: `plugin_<alias>_<name>`. `definePlugin` bakes that
 * prefix in once, at the top of the plugin's schema module, so no call site
 * hand-writes a prefixed string and no plugin can accidentally ship an
 * unprefixed table:
 *
 * ```ts
 * export const tables = definePlugin({
 *     alias: 'backups',
 *     schema: ({ table }) => ({
 *         runs: table('runs', ({ col }) => ({
 *             id: col.id(),
 *             status: col.text({ notNull: true }),
 *         })),
 *     }),
 * });
 * // tables.runs.name === 'plugin_backups_runs'
 * ```
 *
 * The `table` helper mirrors `defineTable`'s callback signatures exactly, so
 * authoring a plugin table reads identically to authoring a core one. Index
 * names are prefixed too — two plugins may both want `idx_lookup`.
 */

import {
    defineTable,
    type AnyCols,
    type ColFactory,
    type IndexFactory,
    type IndexSpec,
    type KyselyOf,
    type TableDescriptor,
} from '@/database/define-table.js';

// ============================================================================
// The scoped `table` helper
// ============================================================================

/**
 * `defineTable` with the plugin's `plugin_<alias>_` prefix applied to the table
 * name and to every declared index name. Callback signatures are `defineTable`'s
 * verbatim.
 */
export type PrefixedDefineTable<A extends string = string> = <
    const C extends AnyCols,
    const N extends string,
>(
    name: N,
    cols: (helpers: { col: ColFactory }) => C,
    indexes?: (helpers: { index: IndexFactory }) => IndexSpec[]
) => TableDescriptor<C, `plugin_${A}_${N}`>;

export type DefinePluginOptions<
    A extends string,
    T extends Record<string, TableDescriptor>,
> = {
    /** The plugin's access key — `redirects`, `backups`. `[a-z0-9-]` only. */
    alias: A;
    schema: (ctx: { table: PrefixedDefineTable<A> }) => T;
};

const ALIAS_PATTERN = /^[a-z0-9-]+$/;

/**
 * Declare a plugin's tables. Returns the schema record unchanged apart from the
 * prefixing, so the plugin exports it directly and feeds it to
 * `PluginDefinition.schema`.
 *
 * Throws at define time (i.e. at module load, before anything can persist) on a
 * malformed alias or an already-prefixed table name.
 */
export function definePlugin<
    const A extends string,
    const T extends Record<string, TableDescriptor>,
>(opts: DefinePluginOptions<A, T>): T {
    const { alias } = opts;
    if (!ALIAS_PATTERN.test(alias)) {
        throw new Error(
            `definePlugin: alias "${alias}" is invalid — aliases may contain only ` +
                `lowercase letters, digits and hyphens.`
        );
    }

    // Same shape as `pluginTablePrefix(alias)` in `plugins/runtime/plugin-identity.ts`,
    // inlined so the database layer keeps no dependency on the plugin runtime.
    const prefix = `plugin_${alias}_`;

    const table = ((name, cols, indexes) => {
        if (name.startsWith('plugin_')) {
            throw new Error(
                `definePlugin: table "${name}" is already prefixed. Pass the bare ` +
                    `name — definePlugin adds "${prefix}" for you.`
            );
        }
        return defineTable(
            `${prefix}${name}` as `plugin_${A}_${typeof name}`,
            cols,
            indexes
                ? (helpers) =>
                      indexes(helpers).map((spec) => ({
                          ...spec,
                          name: `${prefix}${spec.name}`,
                      }))
                : undefined
        );
    }) as PrefixedDefineTable<A>;

    return opts.schema({ table });
}

// ============================================================================
// `PluginDB` — the Kysely interface for a plugin's own tables
// ============================================================================

type NameOf<D> = D extends TableDescriptor<AnyCols, infer N> ? N : never;

/** snake_case → camelCase, the inverse of Kysely's snake-case identifier mapper. */
type Camelize<S extends string> = S extends `${infer Head}_${infer Rest}`
    ? `${Head}${Capitalize<Camelize<Rest>>}`
    : S;

/**
 * The property key a SQL table name has on the Kysely `DB` interface under the
 * active `CamelCasePlugin`. Leading-underscore names round-trip unchanged
 * through the snake-case mapper, so they are their own key (`_astromech_cron`),
 * exactly as `database/types.ts` assumes. Type-level twin of `kyselyTableKey`
 * in `database/codec.ts`.
 */
export type KyselyTableKey<S extends string> = S extends `_${string}` ? S : Camelize<S>;

/**
 * Kysely table types for a plugin's schema, keyed the way the shared `DB`
 * handle sees them — so a plugin can query its own tables with full typing:
 *
 * ```ts
 * const db = getDb() as unknown as Kysely<PluginDB<typeof tables>>;
 * await db.selectFrom('pluginBackupsRuns').selectAll().execute();
 * ```
 */
export type PluginDB<T extends Record<string, TableDescriptor>> = {
    [K in keyof T as KyselyTableKey<NameOf<T[K]>>]: KyselyOf<T[K]>;
};
