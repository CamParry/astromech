/**
 * `callServiceMethod`: the one place a caller that holds a method's name, not
 * the method, calls it on a service object.
 */

/** Anything callable through a string key. */
export type ServiceRecord = Record<string, unknown>;

/**
 * Call `service[name](input)`, throwing `absentMessage` when `service` has no
 * method `name`. Called with `service` as the receiver so a method that
 * reaches for a sibling through the object keeps working; a detached function
 * reference would pass today and break on the first one that doesn't.
 */
export async function callServiceMethod(
    service: ServiceRecord | undefined,
    name: string,
    input: unknown,
    absentMessage: string
): Promise<unknown> {
    const fn = service?.[name];
    if (typeof fn !== 'function') throw new Error(absentMessage);
    return (fn as (input: unknown) => unknown).call(service, input);
}
