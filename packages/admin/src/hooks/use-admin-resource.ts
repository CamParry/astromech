/**
 * One plugin's admin resource as its pages use it, from the plugin namespace
 * and the resource name: its config, link base, label namespace, a caller per
 * service method, and which methods the signed-in user may call.
 */

import type {
    AdminResourceCreateInput,
    AdminResourceDeleteInput,
    AdminResourceGetInput,
    AdminResourceListInput,
    AdminResourceRow,
    AdminResourceUpdateInput,
    QueryResult,
    ResolvedAdminResource,
} from 'astromech';
import { astromechUntypedClient } from 'astromech/fetch';
import adminConfig from 'virtual:astromech/admin-config';
import { labelNamespace } from '../i18n/entry-namespace';
import { usePermissions } from './use-permissions';

/** A view's method: `list`, `get`, `create`, `update` or `delete`. */
export type AdminResourceMethod = keyof ResolvedAdminResource['methods'];

/** The resource's service methods, called over the plugin's RPC route. */
export type AdminResourceClient = {
    list: (input: AdminResourceListInput) => Promise<QueryResult<AdminResourceRow>>;
    get: (input: AdminResourceGetInput) => Promise<AdminResourceRow | null>;
    create: (input: AdminResourceCreateInput) => Promise<AdminResourceRow>;
    update: (input: AdminResourceUpdateInput) => Promise<AdminResourceRow>;
    delete: (input: AdminResourceDeleteInput) => Promise<unknown>;
};

export type UseAdminResourceResult = {
    /** The owning plugin's namespace. */
    plugin: string;
    name: string;
    resource: ResolvedAdminResource;
    /** Link base: `/plugin/redirects/resources/redirects`. */
    basePath: string;
    /** The i18n namespace the resource's labels resolve against. */
    namespace: string;
    client: AdminResourceClient;
    /** Whether the resource declares `method` and the user holds its permission. */
    can: (method: AdminResourceMethod) => boolean;
};

/** The admin resource `name` of plugin `plugin`, or `null` when the config declares none. */
export function useAdminResource(
    plugin: string,
    name: string
): UseAdminResourceResult | null {
    const { hasPermission } = usePermissions();
    const owner = adminConfig.plugins.find((entry) => entry.namespace === plugin);
    const resource = owner?.resources.find((entry) => entry.name === name);
    if (owner === undefined || resource === undefined) return null;
    return {
        plugin,
        name,
        resource,
        basePath: `/plugin/${plugin}/resources/${name}`,
        namespace: labelNamespace(plugin),
        client: adminResourceClient(owner.serviceKey, resource),
        can: (method) => {
            const declared = resource.methods[method];
            return declared !== undefined && hasPermission(declared.permission);
        },
    };
}

function adminResourceClient(
    serviceKey: string,
    resource: ResolvedAdminResource
): AdminResourceClient {
    // The server checks the input, the access and that the method exists; the
    // caller only guards against a view the resource does not declare.
    function call<T>(method: AdminResourceMethod, input: unknown): Promise<T> {
        const declared = resource.methods[method];
        const service = astromechUntypedClient.plugins[serviceKey];
        const fn = declared === undefined ? undefined : service?.[declared.name];
        if (fn === undefined) {
            return Promise.reject(
                new Error(
                    `The admin resource "${resource.name}" has no ${method} method.`
                )
            );
        }
        return fn(input) as Promise<T>;
    }
    return {
        list: (input) => call('list', input),
        get: (input) => call('get', input),
        create: (input) => call('create', input),
        update: (input) => call('update', input),
        delete: (input) => call('delete', input),
    };
}
