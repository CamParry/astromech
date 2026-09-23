/**
 * How a manifest method becomes a call, for every transport that addresses a
 * method by its manifest id: find the method on a service handle, scoped to a
 * role or trusted, and call it with the caller's argument object.
 */
import type { ScopedServices } from '@/policies/scoped-services';
import type { AppContext, CoreManifestMethod, ManifestMethod } from '@/types/index';
import {
    entriesService,
    globalsService,
    mediaService,
    notificationsService,
    usersService,
} from '@/app-context/services';
import { PermissionDeniedError } from '@/errors/permission';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { scopedServices } from '@/policies/scoped-services';

/**
 * Who a call acts for: a context, whose role the scoped handle checks, or a
 * trusted local caller, which acts as the current request or the system.
 */
export type MethodCaller = { ctx: AppContext } | 'trusted';

/** Anything callable through a string key. */
type ServiceRecord = Record<string, unknown>;

/** The handle keys a core manifest method may name. */
type CoreModule = Exclude<keyof ScopedServices, 'entries' | 'plugins'>;

/**
 * Call the service method `method` names, on the handle `caller` gets. A
 * session-scoped method is refused for a trusted caller, which has no
 * signed-in user for the method to act as.
 */
export async function callMethod(
    method: ManifestMethod,
    args: Record<string, unknown>,
    caller: MethodCaller
): Promise<unknown> {
    if (caller === 'trusted' && method.sessionScoped === true) {
        throw new PermissionDeniedError(
            method.id,
            null,
            'is session-scoped, and a trusted caller has no signed-in user to act as.'
        );
    }

    const handle = caller === 'trusted' ? trustedServices() : scopedServices(caller.ctx);

    switch (method.source) {
        case 'core':
            return callOn(coreService(handle, method), method.method, args);
        case 'entries':
            // The type id is pinned last, qualified for a plugin-mounted type, so
            // a caller cannot redirect the call at another type by passing one.
            return callOn(handle.entries, method.method, {
                ...args,
                type: method.typeId,
            });
        case 'plugin':
            return callOn(handle.plugins[method.serviceKey], method.method, args);
    }
}

/** The raw services in the scoped handle's shape, for a caller that is trusted. */
function trustedServices(): ScopedServices {
    return {
        users: usersService,
        media: mediaService,
        entries: entriesService,
        globals: globalsService,
        notifications: notificationsService,
        plugins: pluginServices,
    };
}

/** The core domain service a manifest method's `module` names on the handle. */
function coreService(handle: ScopedServices, method: CoreManifestMethod): ServiceRecord {
    const { module } = method;
    if (module === 'entries' || module === 'plugins' || !Object.hasOwn(handle, module)) {
        throw new Error(`no service registered for domain "${module}"`);
    }
    return handle[module as CoreModule];
}

/**
 * Call `service[key](args)`. Called with `service` as the receiver so a method
 * that reaches for a sibling through the object keeps working; a detached
 * function reference would pass today and break on the first one that doesn't.
 */
async function callOn(
    service: ServiceRecord | undefined,
    key: string,
    args: Record<string, unknown>
): Promise<unknown> {
    const fn = service?.[key];
    if (typeof fn !== 'function') {
        throw new Error(
            `Method "${key}" is in the manifest but absent from the service it names.`
        );
    }
    return (fn as (input: unknown) => Promise<unknown>).call(service, args);
}
