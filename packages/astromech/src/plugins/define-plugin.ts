import type { Permission, PluginDefinition, PluginFactory } from '@/types/index';
import { pluginNamespace } from '@/utilities/plugin-namespace';

/**
 * Define a plugin from one object — identity and behaviour together. Pass a
 * plain definition or a factory (for plugins taking options); either way the
 * result is a factory a site calls: `plugins: [seo(), redirects({ ... })]`.
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
