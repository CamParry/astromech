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

import type { EntriesApi, PluginContext, PluginSdkNamespace } from '@/types/index.js';
import { getCurrentUser } from '@/sdk/local/context.js';
import { entries as localEntries } from '@/sdk/local/entries.js';
import { createScopedEntries } from '@/sdk/local/scoped-entries.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginSdkMethods,
} from '@/core/plugin-runtime.js';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

export const localPlugins: PluginSdkNamespace = new Proxy({} as PluginSdkNamespace, {
    get(_target, nameProp): MethodMap | EntriesApi | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        const name = nameProp;
        // Unknown plugin → undefined; a known plugin with no SDK methods still
        // exposes its `entries` sub-API.
        if (!getPluginIdentity(name)) return undefined;
        const methods = getPluginSdkMethods().get(name) ?? {};

        return new Proxy({} as MethodMap, {
            get(_t, methodProp) {
                if (typeof methodProp !== 'string' || methodProp === 'then')
                    return undefined;
                // `entries` is the reserved per-plugin entries sub-API, not RPC.
                if (methodProp === 'entries') {
                    return createScopedEntries(name, localEntries);
                }
                const method = methods[methodProp];
                if (!method) return undefined;

                return async (input?: unknown): Promise<unknown> => {
                    const identity = getPluginIdentity(name);
                    if (!identity) {
                        throw new Error(`[Astromech] Unknown plugin "${name}".`);
                    }
                    return (method.handler as (i: unknown, c: PluginContext) => unknown)(
                        input,
                        createPluginContext(identity, getCurrentUser())
                    );
                };
            },
        });
    },
});
