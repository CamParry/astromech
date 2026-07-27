/**
 * Local plugin SDK namespace — `Astromech.plugins.<key>.<method>(input)`, where
 * `<key>` is the plugin's SDK key (`acmeSeo`) or, equivalently, its namespace
 * (`acme_seo`) — `getPluginIdentity` resolves either.
 *
 * Methods resolve against the runtime registry (populated at boot from the live
 * plugin definitions) and call the plugin's handler directly against the DB,
 * with a freshly-built PluginContext. The Local API bypasses `access` checks by
 * design — the HTTP API is the enforcement boundary.
 *
 * A Proxy resolves names/methods lazily so the registry need not be populated
 * at module-load time.
 */

import type { EntriesApi, PluginContext, PluginSdkNamespace } from '@/types/index.js';
import { getCurrentUser } from '@/context/index.js';
import { entries as localEntries } from '@/entries/service.js';
import { createScopedEntries } from '@/entries/scoped-entries.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginSdkMethods,
} from '@/plugins/runtime/plugin-runtime.js';

type MethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

export const localPlugins: PluginSdkNamespace = new Proxy({} as PluginSdkNamespace, {
    get(_target, keyProp): MethodMap | EntriesApi | undefined {
        if (typeof keyProp !== 'string' || keyProp === 'then') return undefined;
        // Unknown plugin → undefined; a known plugin with no SDK methods still
        // exposes its `entries` sub-API. The registry is keyed by namespace, so
        // resolve the identity first — the caller may have used the SDK key.
        const resolved = getPluginIdentity(keyProp);
        if (!resolved) return undefined;
        const name = resolved.namespace;
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

                return async (input?: unknown): Promise<unknown> =>
                    (method.handler as (i: unknown, c: PluginContext) => unknown)(
                        input,
                        createPluginContext(resolved, getCurrentUser())
                    );
            },
        });
    },
});
