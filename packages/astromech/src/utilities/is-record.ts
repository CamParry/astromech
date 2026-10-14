/**
 * Whether `value` is an object other than an array: the shape a JSON object
 * parses to. Unlike lodash's `isPlainObject`, it does not check the prototype,
 * so a `Date` or a class instance passes too.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The one name an entry type, global key, role slug or field name may not take.
 * The resolved maps and a field's value objects are plain objects, and
 * assigning `__proto__` sets the object's prototype rather than adding a key;
 * the admin config, emitted as an object literal, would do the same.
 */
export const PROTOTYPE_KEY = '__proto__';
