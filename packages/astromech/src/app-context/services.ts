/**
 * `createServices`: the one function that builds the object of services a
 * caller holds. Binding (which context each call runs as) and access (trusted
 * or checked against the role) are decided here and nowhere else.
 */

import type { AppContext, Services } from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { permissionsFor } from '@/permissions/permissions-for';
import { pluginNamespace, pluginServicesFor } from '@/plugins/runtime/plugin-services';
import { scopeMethods, scopePlugins } from '@/policies/scoped-services';
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
type ContentKey = Exclude<keyof Services, 'plugins'>;

/** Each content service's definition, under the `Services` member that binds it. */
const DEFINITIONS = {
    entries: entriesDefinition,
    globals: globalsDefinition,
    media: mediaDefinition,
    users: usersDefinition,
    notifications: notificationsDefinition,
} satisfies Record<ContentKey, { catalogue: object }>;

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
        entries: entriesDefinition.bind(ctx),
        globals: globalsDefinition.bind(ctx),
        media: mediaDefinition.bind(ctx),
        users: usersDefinition.bind(ctx),
        notifications: notificationsDefinition.bind(ctx),
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
        entries: scopeMethods(
            trusted.entries,
            entriesDefinition.catalogue,
            caller,
            'entries'
        ),
        globals: scopeMethods(
            trusted.globals,
            globalsDefinition.catalogue,
            caller,
            'globals'
        ),
        media: scopeMethods(trusted.media, mediaDefinition.catalogue, caller, 'media'),
        users: scopeMethods(trusted.users, usersDefinition.catalogue, caller, 'users'),
        notifications: scopeMethods(
            trusted.notifications,
            notificationsDefinition.catalogue,
            caller,
            'notifications'
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
    entries: forwardToCurrent('entries'),
    globals: forwardToCurrent('globals'),
    media: forwardToCurrent('media'),
    users: forwardToCurrent('users'),
    notifications: forwardToCurrent('notifications'),
    plugins: pluginNamespace(
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
