import type {
    AnyCols,
    ColFactory,
    IndexFactory,
    IndexSpec,
    KyselyOf,
    Table,
} from '@/database/define-table';
import type { PluginIdentity } from '@/types/plugins';
import type { PluginNamespace } from '@/utilities/plugin-namespace';
import { defineTable } from '@/database/define-table';
import { pluginNamespace } from '@/utilities/plugin-namespace';

/**
 * `definePluginTable` — the scoped table factory a plugin uses to declare one
 * of its own tables, namespaced `plugin_<namespace>_<name>` so no plugin can
 * ship an unprefixed table and the prefix always matches what the runtime computes.
 */

/** Accepted first argument: the package name, or any object carrying one. */
type PackageSource = string | PluginIdentity;

/** The package name a {@link PackageSource} denotes, as a literal type. */
type PackageOf<S extends PackageSource> = S extends string
    ? S
    : S extends { package: infer P extends string }
      ? P
      : never;

const TABLE_NAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Declare one of a plugin's tables. Returns a `Table` whose
 * name (and every declared index name) carries the plugin's prefix, so the
 * plugin exports it directly and feeds it to `PluginDefinition.schema`.
 *
 * Throws at define time — module load, before anything can persist — on a
 * malformed or already-prefixed table name.
 */
export function definePluginTable<
    const S extends PackageSource,
    const N extends string,
    const C extends AnyCols,
>(
    source: S,
    name: N,
    cols: (helpers: { col: ColFactory }) => C,
    indexes?: (helpers: { index: IndexFactory }) => IndexSpec[]
): Table<C, `plugin_${PluginNamespace<PackageOf<S>>}_${N}`> {
    const pkg = typeof source === 'string' ? source : source.package;
    const namespace = pluginNamespace(pkg);
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
        `${prefix}${name}` as `plugin_${PluginNamespace<PackageOf<S>>}_${N}`,
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

type NameOf<D> = D extends Table<AnyCols, infer N> ? N : never;

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
export type PluginDB<T extends Record<string, Table>> = {
    [K in keyof T as KyselyTableKey<NameOf<T[K]>>]: KyselyOf<T[K]>;
};
