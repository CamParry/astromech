/**
 * `package` → plugin namespace. A pure leaf because two capabilities need the
 * same derivation and neither may import the other: `plugins/runtime` resolves
 * a plugin's full identity from it, and `database/define-plugin-table` needs
 * the same string (and the same *literal type*) to build a plugin's table
 * prefix at module load.
 *
 * The rules, in order — see `plugins/runtime/plugin-identity.ts` for the why:
 *   1. `@astromech/*` strips its scope (first-party; the npm scope is ours).
 *   2. everything else drops the leading `@` and keeps its scope.
 *   3. lowercase, then `/` and `-` → `_`.
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
 * The one namespace a plugin owns, derived from its package name.
 *
 *     `@astromech/redirects`    → `redirects`
 *     `@acme/seo`               → `acme_seo`
 *     `acme-seo`                → `acme_seo`
 *     `@acme-digital/seo-tools` → `acme_digital_seo_tools`
 *
 * Generic over the literal so `definePluginTable` can build a literal table
 * name — `PluginDB` derives its Kysely keys from that literal and silently
 * degrades to `string` keys without it.
 */
export function pluginNamespace<const P extends string>(pkg: P): PluginNamespace<P> {
    const lower = pkg.toLowerCase();
    const stripped = lower.startsWith('@astromech/')
        ? lower.slice('@astromech/'.length)
        : lower.replace(/^@/, '');
    return stripped.replace(/[/-]/g, '_') as PluginNamespace<P>;
}

/** The JS-identifier form, for SDK and admin property keys: `acme_seo` → `acmeSeo`. */
export function pluginSdkKey(namespace: string): string {
    return namespace.replace(/_(.)/g, (_, char: string) => char.toUpperCase());
}
