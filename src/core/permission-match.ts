/**
 * Segment-wise permission matching.
 *
 * Grammar: `resource[:identifier]:action` segments joined by `:`.
 * - `*` as the entire pattern grants everything.
 * - `*` mid-pattern matches exactly one segment.
 * - A trailing `*` matches one or more remaining segments.
 *
 * Check strings are always concrete (callers never pass wildcards in `check`).
 */
export function matchesPermission(pattern: string, check: string): boolean {
    if (pattern === '*') return true;
    const patternSegments = pattern.split(':');
    const checkSegments = check.split(':');
    for (let i = 0; i < patternSegments.length; i++) {
        const segment = patternSegments[i] ?? '';
        if (segment === '*' && i === patternSegments.length - 1) {
            return checkSegments.length > i;
        }
        if (i >= checkSegments.length) return false;
        if (segment !== '*' && segment !== checkSegments[i]) return false;
    }
    return patternSegments.length === checkSegments.length;
}

/** Check whether any pattern in a permissions array grants the requested permission. */
export function hasPermission(permissions: readonly string[], check: string): boolean {
    return permissions.some((pattern) => matchesPermission(pattern, check));
}
