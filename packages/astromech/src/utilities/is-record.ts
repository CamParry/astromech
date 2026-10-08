/**
 * Whether `value` is an object other than an array: the shape a JSON object
 * parses to. Unlike lodash's `isPlainObject`, it does not check the prototype,
 * so a `Date` or a class instance passes too.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
