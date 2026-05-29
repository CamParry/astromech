/**
 * Local plugin SDK namespace — `Astromech.plugins.<name>.<method>(input)`.
 *
 * Methods resolve against the runtime registry (populated at boot from the live
 * plugin definitions) and call the plugin's handler directly against the DB,
 * with a freshly-built PluginContext. The local SDK bypasses `access` checks by
 * design — the HTTP API is the enforcement boundary.
 *
 * A Proxy resolves names/methods lazily so the registry need not be populated
 * at module-load time.
 */

import type { PluginSdkNamespace } from '@/types/index.js';
import { getCurrentUser } from '@/sdk/local/context.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginSdkMethods,
} from '@/core/plugin-runtime.js';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

export const localPlugins: PluginSdkNamespace = new Proxy({} as PluginSdkNamespace, {
    get(_target, nameProp): MethodMap | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        const name = nameProp;
        const methods = getPluginSdkMethods().get(name);
        if (!methods) return undefined;

        return new Proxy({} as MethodMap, {
            get(_t, methodProp) {
                if (typeof methodProp !== 'string' || methodProp === 'then') return undefined;
                const method = methods[methodProp];
                if (!method) return undefined;

                return async (input?: unknown): Promise<unknown> => {
                    const identity = getPluginIdentity(name);
                    if (!identity) {
                        throw new Error(`[Astromech] Unknown plugin "${name}".`);
                    }
                    return method.handler(input, createPluginContext(identity, getCurrentUser()));
                };
            },
        });
    },
});
