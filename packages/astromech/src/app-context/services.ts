/**
 * `createServices`: the one function that builds the object of services a
 * caller holds. Binding (which context each call runs as) and access (trusted
 * or checked against the role) are decided here and nowhere else.
 */

import type { AppContext, ServiceDefinition, Services } from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    createPluginServices,
    pluginServicesFor,
} from '@/plugins/runtime/plugin-services';
import { scopeMethods, scopePlugins } from '@/policies/scoped-services';
import { securityDefinition } from '@/security/service';
import { usersDefinition } from '@/users/service';

/** How the handle `createServices` builds treats each method's `access`. */
export type CreateServicesOptions = {
    /**
     * Skip each method's `access`, as trusted server code does. Defaults to
     * `true`. `false` refuses every call `ctx.role` may not make, for a caller
     * that arrived over a transport.
     */
    overrideAccess?: boolean;
};

/** The `Services` members that hold a core content service. */
export type ContentKey = Exclude<keyof Services, 'plugins'>;

/** The core content services alone, without the plugin namespace. */
type ContentServices = Pick<Services, ContentKey>;

/**
 * Each content service's definition, under the `Services` member that binds it.
 * Typed per key, so `DEFINITIONS[key].bind(ctx)` is `Services[K]` for a generic key.
 */
const DEFINITIONS: { [K in ContentKey]: ServiceDefinition<Services[K]> } = {
    entries: entriesDefinition,
    globals: globalsDefinition,
    media: mediaDefinition,
    users: usersDefinition,
    notifications: notificationsDefinition,
    security: securityDefinition,
};

/** The content service keys. `Object.keys` is typed `string[]`, hence the cast. */
const CONTENT_KEYS = Object.keys(DEFINITIONS) as ContentKey[];

const TRUSTED = new WeakMap<AppContext, Services>();
const SCOPED = new WeakMap<AppContext, Services>();

/**
 * Every service, each call run as `ctx`. Built once per context and access
 * mode. A denied method on a scoped handle still exists and throws.
 */
export function createServices(
    ctx: AppContext,
    options: CreateServicesOptions = {}
): Services {
    const scoped = options.overrideAccess === false;
    const cache = scoped ? SCOPED : TRUSTED;
    const existing = cache.get(ctx);
    if (existing) return existing;

    const services = scoped ? scopeServices(ctx) : bindServices(ctx);
    cache.set(ctx, services);
    return services;
}

/** Each definition bound to `ctx`, and the plugin namespace running as it. */
function bindServices(ctx: AppContext): Services {
    return {
        ...mapContentServices((key) => DEFINITIONS[key].bind(ctx)),
        plugins: pluginServicesFor(ctx),
    };
}

/** The trusted services for `ctx`, each method wrapped in its role check. */
function scopeServices(ctx: AppContext): Services {
    const trusted = createServices(ctx);
    const caller = { permissions: permissionsFor(ctx.role), user: ctx.user };
    // An entry's and a global's permissions depend on the call's `type` or
    // `key`, and each contract states that in the function form, the `full`
    // and publish gates included.
    return {
        ...mapContentServices((key) =>
            scopeMethods(trusted[key], DEFINITIONS[key].catalogue, caller, key)
        ),
        plugins: scopePlugins(trusted.plugins, caller.permissions),
    };
}

/**
 * The trusted services acting as whoever the current request is, or as the
 * system outside one: each call resolves `currentAppContext()` and calls the
 * method on `createServices` of it. For a caller that holds no context.
 */
export const currentServices: Services = {
    ...mapContentServices(forwardToCurrent),
    plugins: createPluginServices(
        (resolved, _method, name) => async (input) =>
            createServices(await currentAppContext()).plugins[resolved.serviceKey]?.[
                name
            ]?.(input)
    ),
};

/** Every method of the `key` service, each forwarded to the current context's. */
function forwardToCurrent<K extends ContentKey>(key: K): Services[K] {
    const forwarded: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const method of Object.keys(DEFINITIONS[key].catalogue)) {
        forwarded[method] = async (input) => {
            const service: Record<string, unknown> = createServices(
                await currentAppContext()
            )[key];
            return (service[method] as (input: unknown) => unknown).call(service, input);
        };
    }
    return forwarded as Services[K];
}

/**
 * `target` with a getter per content service, each returning `get(key)` on
 * every read. The `AppContext` builds its members this way.
 */
export function addServiceGetters<T extends object>(
    target: T,
    get: <K extends ContentKey>(key: K) => Services[K]
): T & ContentServices {
    for (const key of CONTENT_KEYS) {
        Object.defineProperty(target, key, {
            get: () => get(key),
            enumerable: true,
            configurable: true,
        });
    }
    // TypeScript cannot see that the loop defines every key.
    return target as T & ContentServices;
}

/** One member per content service, each built once by `build`. */
function mapContentServices(
    build: <K extends ContentKey>(key: K) => Services[K]
): ContentServices {
    const services: Record<string, unknown> = {};
    for (const key of CONTENT_KEYS) {
        services[key] = build(key);
    }
    // TypeScript cannot see that the loop sets every key.
    return services as ContentServices;
}
