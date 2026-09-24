/** Splitting an id list so each `IN (…)` stays under D1's bound-parameter cap. */

/** D1 caps a query at 100 bound parameters, and each id in an `IN (…)` binds one. */
export const MAX_BOUND_PARAMETERS = 100;

/**
 * The distinct `ids` in slices of at most `size`. A query that binds other
 * parameters beside the list passes a smaller `size`.
 */
export function chunks(ids: Iterable<string>, size = MAX_BOUND_PARAMETERS): string[][] {
    const unique = Array.from(new Set(ids));
    const slices: string[][] = [];
    for (let i = 0; i < unique.length; i += size) slices.push(unique.slice(i, i + size));
    return slices;
}
