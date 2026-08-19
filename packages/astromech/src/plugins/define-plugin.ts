import type { Permission, PluginDefinition, PluginFactory } from '@/types/index';
import { pluginNamespace } from '@/utilities/plugin-namespace';

/**
 * Define a plugin from one object — identity and behaviour together, the way
 * `defineConfig` takes one config. `package` is a key like any other, so a
 * plugin never has to hand its own identity to itself, and nothing inside the
 * package needs to import an identity module to build a namespaced string.
 *
 * Pass a plain definition, or a factory when the plugin takes options. Either
 * way the result is a **factory**, so sites always call it: `plugins: [seo(),
 * redirects({ … })]`.
 *
 * Relative asset specifiers (`'./admin/pages/overview.tsx'`) on `fields`,
 * `admin.pages`, `admin.slots` and `i18n` resolve against `root` — see
 * {@link PluginDefinition.root}.
 *
 * The factory carries a `permissions(...keys)` accessor that selects individual
 * keys from the definition's `permissions` declaration and returns them already
 * namespaced, so a site composes roles straight off the plugin and enumerates
 * exactly what it grants: `[...seo.permissions('view', 'write')]`.
 *
 * A factory MUST be a pure data builder: Astromech calls it once with no
 * options to read identity and permission declarations, and again for each site
 * instantiation.
 *
 * @example
 * export const seo = definePlugin({
 *     package: '@astromech/seo',
 *     label: 'SEO',
 *     fields: [seoPreviewField],
 * });
 *
 * @example
 * export const redirects = definePlugin((options?: RedirectsOptions) => ({
 *     package: '@astromech/redirects',
 *     entries: [redirectEntryType],
 *     ...(options?.generateOnSlugChange !== false && { hooks: [slugChangeHook] }),
 * }));
 */
export function definePlugin<const Def extends PluginDefinition, Options = void>(
    source: Def | ((options?: Options) => Def)
): PluginFactory<Options, Def> {
    const build = (options?: Options): Def =>
        typeof source === 'function' ? source(options) : source;

    // One no-options build backs the surfaces a site reads *without*
    // instantiating the plugin — identity and permission declarations. Cached so
    // a factory is not re-run per `permissions()` call.
    let base: Def | undefined;
    const baseDefinition = (): Def => (base ??= build());

    const factory = ((options?: Options) => build(options)) as PluginFactory<
        Options,
        Def
    >;

    factory.permissions = (...keys: string[]) => {
        const definition = baseDefinition();
        const declared = definition.permissions ?? {};
        if (keys.length === 0) {
            throw new Error(
                `\`${definition.package}\`.permissions() needs at least one permission key. ` +
                    `Name the permissions to grant, e.g. permissions('read', 'update').`
            );
        }
        const available = Object.keys(declared);
        for (const key of keys) {
            if (!(key in declared)) {
                throw new Error(
                    `Unknown permission "${key}" for plugin "${definition.package}". ` +
                        (available.length > 0
                            ? `Available: ${available.join(', ')}.`
                            : `The plugin declares no \`permissions\`.`)
                );
            }
        }
        const namespace = pluginNamespace(definition.package);
        return keys.map((key) => `plugin:${namespace}:${key}` as Permission);
    };

    return factory;
}
