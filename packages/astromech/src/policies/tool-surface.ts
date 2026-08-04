/**
 * `reduceSurface(methods, options)` — the set of methods a transport may expose.
 *
 * Reduction is STRUCTURAL where an annotation is advisory. `annotate-manifest.ts`
 * tells a caller "you may not call this"; a reduced surface means the method is
 * not in the tool list, has no dispatch entry, and cannot be named. That
 * difference is the whole point: an annotation depends on the caller respecting
 * it, and an agent is exactly the caller that does not.
 *
 * This is the layer the ecosystem converged on. GitHub's MCP server ships
 * `--read-only` as "a strict security filter that takes precedence over any other
 * configuration, disabling write tools even when explicitly requested"; Stripe's
 * ships the same flag. Their precedence is copied here deliberately, including
 * the part that looks like a bug — `readOnly` beats an explicit `include`. A
 * caller that can widen the read-only surface by naming a method has a read-only
 * flag that documents an intention rather than enforcing one.
 *
 * `readOnly` keys off `mutates`, which is a REQUIRED field on every service
 * descriptor and therefore on every manifest method, so there is no method this
 * cannot classify. There is no "unknown effect" bucket to fail closed into.
 *
 * This is NOT the permission boundary — `policies/scoped-service.ts` is. A
 * surface decides what a transport OFFERS; permissions decide what a role may
 * do with what it was offered. Reducing the surface of a handle that was
 * never scoped grants nothing.
 */

import type { ManifestMethod } from '@/types/index.js';

// ============================================================================
// Types
// ============================================================================

export type SurfaceOptions = {
    /**
     * Drop every mutating method. Strict: applied first, overrides `include`.
     */
    readOnly?: boolean | undefined;
    /** When non-empty, keep ONLY methods matching one of these patterns. */
    include?: string[] | undefined;
    /** Drop methods matching one of these patterns. */
    exclude?: string[] | undefined;
};

/** A method the surface dropped, and the rule that dropped it. */
export type ExcludedMethod = { id: string; reason: string };

export type SurfaceResult = {
    methods: ManifestMethod[];
    excluded: ExcludedMethod[];
};

// ============================================================================
// Matching
// ============================================================================

/**
 * Does `pattern` address `method`?
 *
 * The grammar is deliberately two rules and no more:
 *
 * - an exact match against the method's `id` OR its `name`
 * - a trailing `*`, which prefix-matches against either
 *
 * So `entries.*` addresses every entry method, and `entries.posts.publish`
 * addresses exactly one. `name` is matched as well as `id` because a human
 * typing `--exclude users.delete` means the method, and `users.delete` happens
 * to be both. Note that `name` is not unique (`entries.create` names every entry
 * type's create), which makes a name pattern a broad instrument on purpose.
 *
 * There is no fuller glob syntax — no `?`, no mid-string `*`, no braces. A
 * surface policy that needs a regex engine to predict is a surface policy nobody
 * can audit.
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

// ============================================================================
// Reduction
// ============================================================================

/**
 * Project a manifest's methods down to the surface `options` allows.
 *
 * Precedence, in order, first rule to fire wins:
 *
 * 1. `readOnly` drops anything with `mutates: true`, even when `include` names it.
 * 2. `exclude` drops a match.
 * 3. `include`, when non-empty, keeps only matches.
 *
 * Every dropped method is reported in `excluded` with the reason it was dropped,
 * and `methods.length + excluded.length` always equals the input length. Nothing
 * is dropped silently: a surface that quietly shrinks reads to a caller as "that
 * method does not exist", which sends it hunting for a bug in the wrong place.
 *
 * No options is a no-op — every method through, `excluded` empty.
 */
export function reduceSurface(
    methods: ManifestMethod[],
    options: SurfaceOptions
): SurfaceResult {
    const include = options.include ?? [];
    const exclude = options.exclude ?? [];

    const kept: ManifestMethod[] = [];
    const excluded: ExcludedMethod[] = [];

    for (const method of methods) {
        if (options.readOnly === true && method.mutates) {
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
