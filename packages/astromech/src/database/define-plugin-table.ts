/**
 * `definePluginTable` — the scoped table factory a plugin package uses to
 * declare one of its own tables.
 *
 * A plugin's tables live in the same database as the app's, so they are
 * namespaced: `plugin_<namespace>_<name>`, where the namespace derives from the
 * plugin's `package` and nothing else. Taking the identity object as the first
 * argument means no call site hand-writes a prefixed string, no plugin can
 * accidentally ship an unprefixed table, and the prefix can never disagree with
 * the one the runtime computes for permissions, routes and migrations.
 *
 * ```ts
 * import { definePluginTable } from 'astromech/plugin-kit';
 * import { plugin } from '../plugin.js';
 *
 * export const runsTable = definePluginTable(plugin, 'runs', ({ col }) => ({
 *     id: col.id(),
 *     status: col.text({ notNull: true }),
 * }));
 * // runsTable.name === 'plugin_backups_runs'
 * ```
 *
 * Singular, matching the one-file-per-table layout. The `cols`/`indexes`
 * callbacks are `defineTable`'s verbatim, so authoring a plugin table reads
 * identically to authoring a core one. Index names are prefixed too — two
 * plugins may both want `idx_lookup`.
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
import { pluginNamespace, type PluginNamespace } from '@/utilities/plugin-namespace.js';
import type { PluginIdentity } from '@/types/plugins.js';

const TABLE_NAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Declare one of a plugin's tables. Returns a `defineTable` descriptor whose
 * name (and every declared index name) carries the plugin's prefix, so the
 * plugin exports it directly and feeds it to `PluginDefinition.schema`.
 *
 * Throws at define time — module load, before anything can persist — on a
 * malformed or already-prefixed table name.
 */
export function definePluginTable<
    const I extends PluginIdentity,
    const N extends string,
    const C extends AnyCols,
>(
    identity: I,
    name: N,
    cols: (helpers: { col: ColFactory }) => C,
    indexes?: (helpers: { index: IndexFactory }) => IndexSpec[]
): TableDescriptor<C, `plugin_${PluginNamespace<I['package']>}_${N}`> {
    const namespace = pluginNamespace(identity.package);
    // Same shape as `pluginTablePrefix(namespace)` in
    // `plugins/runtime/plugin-identity.ts`; only the derivation is shared (via
    // the pure leaf), so the database layer keeps no dependency on the runtime.
    const prefix = `plugin_${namespace}_`;

    if (name.startsWith('plugin_')) {
        throw new Error(
            `definePluginTable: table "${name}" is already prefixed. Pass the bare ` +
                `name — definePluginTable adds "${prefix}" for you.`
        );
    }
    if (!TABLE_NAME_PATTERN.test(name)) {
        throw new Error(
            `definePluginTable: table name "${name}" is invalid — plugin table names may ` +
                `contain only lowercase letters, digits and underscores.`
        );
    }

    return defineTable(
        `${prefix}${name}` as `plugin_${PluginNamespace<I['package']>}_${N}`,
        cols,
        indexes
            ? (helpers) =>
                  indexes(helpers).map((spec) => ({
                      ...spec,
                      name: `${prefix}${spec.name}`,
                  }))
            : undefined
    );
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
