/**
 * How a manifest method becomes a call, for every transport that addresses a
 * method by its manifest id: find the method on a service handle, scoped to a
 * role or trusted, and call it with the caller's argument object.
 */
import type { AppContext, ManifestMethod, Services } from '@/types/index';
import { createServices, currentServices } from '@/app-context/services';
import { PermissionDeniedError } from '@/errors/permission';

/**
 * Who a call acts for: a context, whose role the scoped handle checks, or a
 * trusted local caller, which acts as the current request or the system.
 */
export type MethodCaller = { ctx: AppContext } | 'trusted';

/** Anything callable through a string key. */
type ServiceRecord = Record<string, unknown>;

/** The handle keys that hold a content service. */
type ContentModule = Exclude<keyof Services, 'plugins'>;

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

    const handle =
        caller === 'trusted'
            ? currentServices
            : createServices(caller.ctx, { overrideAccess: false });

    switch (method.source) {
        case 'core':
            return callOn(contentService(handle, method.module), method.method, args);
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

/**
 * The content service `module` names on `handle`. Plugins are addressed per
 * plugin, so `plugins` is not one.
 */
export function contentService(handle: Services, module: string): ServiceRecord {
    if (module === 'plugins' || !Object.hasOwn(handle, module)) {
        throw new Error(`no service registered for domain "${module}"`);
    }
    return handle[module as ContentModule];
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
