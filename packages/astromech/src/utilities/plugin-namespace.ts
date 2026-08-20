/**
 * `package` → plugin namespace. A pure leaf shared by `plugins/runtime`
 * (identity resolution) and `database/define-plugin-table` (literal table
 * prefix), so both derive the same string and the same literal type.
 */

/** Every occurrence of `From` in `S` replaced with `To`; `string` stays `string`. */
type ReplaceAll<
    S extends string,
    From extends string,
    To extends string,
> = S extends `${infer Head}${From}${infer Tail}`
    ? `${Head}${To}${ReplaceAll<Tail, From, To>}`
    : S;

/**
 * `/` and `-` → `_`. A namespace can never contain a hyphen: hyphens don't
 * survive Kysely's snake-case identifier mapping, so `plugin_acme-seo_*` could
 * never round-trip to a `CamelCasePlugin` key.
 */
type Underscored<S extends string> = ReplaceAll<ReplaceAll<S, '/', '_'>, '-', '_'>;

/** Type-level twin of {@link pluginNamespace}. */
export type PluginNamespace<P extends string> =
    Lowercase<P> extends `@astromech/${infer Rest}`
        ? Underscored<Rest>
        : Lowercase<P> extends `@${infer Rest}`
          ? Underscored<Rest>
          : Underscored<Lowercase<P>>;

/**
 * The one namespace a plugin owns, derived from its package name (e.g.
 * `@astromech/redirects` → `redirects`, `acme-seo` → `acme_seo`). Generic
 * over the literal so `definePluginTable` can build a literal table name.
 */
export function pluginNamespace<const P extends string>(pkg: P): PluginNamespace<P> {
    const lower = pkg.toLowerCase();
    const stripped = lower.startsWith('@astromech/')
        ? lower.slice('@astromech/'.length)
        : lower.replace(/^@/, '');
    return stripped.replace(/[/-]/g, '_') as PluginNamespace<P>;
}

/**
 * The JS-identifier form, for service property keys and route segments
 * (`acme_seo` → `acmeSeo`). LOSSY: two namespaces can collide on one key,
 * which `assertNoPluginCollisions` rejects at boot rather than silently allowing.
 */
export function pluginServiceKey(namespace: string): string {
    return namespace.replace(/_(.)/g, (_, char: string) => char.toUpperCase());
}
