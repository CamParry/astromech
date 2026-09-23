/**
 * The plugin service namespace, `plugins.<serviceKey>.<method>(input)`. Calls
 * through it are trusted server code and skip `access`; an untrusted caller goes
 * through `scopedServices(ctx).plugins`, which enforces it.
 */

import type {
    AnyServiceMethod,
    AppContext,
    PluginContext,
    PluginServiceNamespace,
    ResolvedPluginIdentity,
} from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import { parseMethodInput } from '@/services/parse-method-input';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

/**
 * The namespace bound to `ctx`: each method runs with its own plugin's context
 * layered over `ctx`, so it acts as the caller did.
 */
export function pluginServicesFor(ctx: AppContext): PluginServiceNamespace {
    return namespace(
        (resolved, method) => async (input) =>
            (method.handler as (i: unknown, c: PluginContext) => unknown)(
                parseMethodInput(method, input),
                createPluginContext(resolved, ctx)
            )
    );
}

/** The namespace acting as whoever the current request is — `app.plugins`. */
export const pluginServices: PluginServiceNamespace = namespace(
    (resolved, _method, name) => async (input) =>
        pluginServicesFor(await currentAppContext())[resolved.serviceKey]?.[name]?.(input)
);

/**
 * A namespace whose methods `call` builds. An unknown plugin or method reads as
 * undefined, and `then` is never a method, so the namespace is not a thenable.
 */
function namespace(
    call: (
        resolved: ResolvedPluginIdentity,
        method: AnyServiceMethod,
        name: string
    ) => (input?: unknown) => Promise<unknown>
): PluginServiceNamespace {
    return new Proxy({} as PluginServiceNamespace, {
        get(_target, keyProp): MethodMap | undefined {
            if (typeof keyProp !== 'string' || keyProp === 'then') return undefined;
            // The registry is keyed by namespace, so resolve the identity from
            // the service key first.
            const resolved = getPluginIdentity(keyProp);
            if (!resolved) return undefined;
            const methods = getPluginServiceMethods().get(resolved.namespace) ?? {};

            return new Proxy({} as MethodMap, {
                get(_t, methodProp) {
                    if (typeof methodProp !== 'string' || methodProp === 'then') {
                        return undefined;
                    }
                    const method = methods[methodProp];
                    return method ? call(resolved, method, methodProp) : undefined;
                },
            });
        },
    });
}
