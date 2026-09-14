/**
 * The plugin service namespace, `plugins.<serviceKey>.<method>(input)`. Calls
 * through `ctx.plugins` are trusted server code and skip `access`; an untrusted
 * caller goes through `scopedServices(role).plugins`, which enforces it.
 */

import type { PluginContext, PluginServiceNamespace } from '@/types/index';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import {
    getCurrentClientAddress,
    getCurrentRole,
    getCurrentUser,
} from '@/request-context/request-context';
import { parseMethodInput } from '@/services/parse-method-input';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

export const pluginServices: PluginServiceNamespace = new Proxy(
    {} as PluginServiceNamespace,
    {
        get(_target, keyProp): MethodMap | undefined {
            if (typeof keyProp !== 'string' || keyProp === 'then') return undefined;
            // Unknown plugin → undefined. The registry is keyed by namespace, so
            // resolve the identity from the service key first.
            const resolved = getPluginIdentity(keyProp);
            if (!resolved) return undefined;
            const name = resolved.namespace;
            const methods = getPluginServiceMethods().get(name) ?? {};

            return new Proxy({} as MethodMap, {
                get(_t, methodProp) {
                    if (typeof methodProp !== 'string' || methodProp === 'then')
                        return undefined;
                    const method = methods[methodProp];
                    if (!method) return undefined;

                    return async (input?: unknown): Promise<unknown> =>
                        (method.handler as (i: unknown, c: PluginContext) => unknown)(
                            parseMethodInput(method, input),
                            createPluginContext(
                                resolved,
                                await getCurrentUser(),
                                await getCurrentRole(),
                                getCurrentClientAddress()
                            )
                        );
                },
            });
        },
    }
);
