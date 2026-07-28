/**
 * Local plugin service namespace — `Astromech.plugins.<serviceKey>.<method>(input)`.
 * The key is the plugin's service key (`acmeSeo`), matching the HTTP transport's
 * route segment exactly, so the two transports address plugins identically.
 *
 * Methods resolve against the runtime registry (populated at boot from the live
 * plugin definitions) and call the plugin's handler directly against the DB,
 * with a freshly-built PluginContext. The Local API bypasses `access` checks by
 * design — the HTTP API is the enforcement boundary.
 *
 * A Proxy resolves names/methods lazily so the registry need not be populated
 * at module-load time.
 */

import type { PluginContext, PluginServiceNamespace } from '@/types/index.js';
import { getCurrentUser } from '@/context/index.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime.js';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

export const localPlugins: PluginServiceNamespace = new Proxy(
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
                            input,
                            createPluginContext(resolved, getCurrentUser())
                        );
                },
            });
        },
    }
);
