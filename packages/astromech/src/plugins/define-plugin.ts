import type {
    Permission,
    PluginDefinition,
    PluginFactory,
    PluginHelper,
    ResolvedPluginIdentity,
} from '@/types/index';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

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

    // The no-options build backs what a site reads without instantiating the
    // plugin: its permission declarations and its helpers.
    const base = build();
    const identity = resolvePluginIdentity(base);

    const factory = ((options?: Options) => build(options)) as PluginFactory<
        Options,
        Def
    >;

    factory.permissions = (...keys: string[]) => {
        const declared = base.permissions ?? {};
        if (keys.length === 0) {
            throw new Error(
                `\`${base.package}\`.permissions() needs at least one permission key. ` +
                    `Name the permissions to grant, e.g. permissions('read', 'update').`
            );
        }
        const available = Object.keys(declared);
        for (const key of keys) {
            if (!(key in declared)) {
                throw new Error(
                    `Unknown permission "${key}" for plugin "${base.package}". ` +
                        (available.length > 0
                            ? `Available: ${available.join(', ')}.`
                            : `The plugin declares no \`permissions\`.`)
                );
            }
        }
        return keys.map(
            (key) => `plugin:${identity.permissionNamespace}:${key}` as Permission
        );
    };

    for (const [key, helper] of Object.entries(base.helpers ?? {})) {
        if (key in factory) {
            throw new Error(
                `Plugin "${base.package}" declares a helper named "${key}", which the ` +
                    `plugin factory already has. Rename the helper.`
            );
        }
        Object.defineProperty(factory, key, {
            value: bindHelper(helper, identity),
            enumerable: true,
        });
    }

    return factory;
}

function bindHelper(helper: PluginHelper, identity: ResolvedPluginIdentity) {
    return (...args: never[]): unknown => helper(identity, ...args);
}
