/**
 * The set of methods a transport may expose. Filtering is STRUCTURAL where
 * `annotate-manifest.ts` is advisory — a filtered-out method has no dispatch
 * entry. NOT the permission boundary: `policies/scoped-services.ts` is that.
 */

import type { ManifestMethod } from '@/types/index';

export type MethodFilter = {
    /**
     * Drop every mutating method. Strict: applied first, overrides `include`.
     */
    readOnly?: boolean | undefined;
    /** When non-empty, keep ONLY methods matching one of these patterns. */
    include?: string[] | undefined;
    /** Drop methods matching one of these patterns. */
    exclude?: string[] | undefined;
};

/** A method the filter dropped, and the rule that dropped it. */
export type ExcludedMethod = { id: string; reason: string };

export type FilterResult = {
    methods: ManifestMethod[];
    excluded: ExcludedMethod[];
};

/**
 * Does `pattern` address `method`? Exact match against `id` or `name`, or a
 * trailing `*` prefix-matching either — no fuller glob syntax, since a filter
 * that needs a regex engine to predict is one nobody can audit.
 */
function matches(pattern: string, method: ManifestMethod): boolean {
    if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return method.id.startsWith(prefix) || method.name.startsWith(prefix);
    }
    return pattern === method.id || pattern === method.name;
}

/** Does any pattern in the list address this method? */
function matchesAny(patterns: string[], method: ManifestMethod): boolean {
    return patterns.some((pattern) => matches(pattern, method));
}

/**
 * Narrow a manifest's methods down to the ones `filter` allows: `readOnly`
 * drops mutating methods first (even ones `include` names), then `exclude`,
 * then `include`. Every dropped method is reported in `excluded` with a reason.
 */
export function filterMethods(
    methods: ManifestMethod[],
    filter: MethodFilter
): FilterResult {
    const include = filter.include ?? [];
    const exclude = filter.exclude ?? [];

    const kept: ManifestMethod[] = [];
    const excluded: ExcludedMethod[] = [];

    for (const method of methods) {
        if (filter.readOnly === true && method.mutates) {
            excluded.push({
                id: method.id,
                reason: 'read-only surface: method mutates state',
            });
            continue;
        }
        if (exclude.length > 0 && matchesAny(exclude, method)) {
            excluded.push({ id: method.id, reason: 'excluded by surface policy' });
            continue;
        }
        if (include.length > 0 && !matchesAny(include, method)) {
            excluded.push({ id: method.id, reason: 'not in the included surface' });
            continue;
        }
        kept.push(method);
    }

    return { methods: kept, excluded };
}
