/**
 * The recoverable tier of an output schema: `.catch(fallback(null))` puts the
 * default in place of a stored value its schema refuses, and counts it for the
 * parse `countFallbacks` is running, which `parseOutput` logs.
 */

import { globals } from '@/registry';

/**
 * A `.catch` handler answering `value`. Each call is counted while
 * `countFallbacks` runs; outside one it only substitutes.
 */
export function fallback<T>(value: T): () => T {
    return () => {
        const namespace = globals();
        if (namespace.outputFallbacks !== undefined) namespace.outputFallbacks += 1;
        return value;
    };
}

/**
 * Run a synchronous parse and count the fallbacks its `.catch` handlers took.
 * The count lives on the shared namespace, so a schema from a second copy of
 * the package still reports to this parse.
 */
export function countFallbacks<T>(parse: () => T): { result: T; fallbacks: number } {
    const namespace = globals();
    const outer = namespace.outputFallbacks;
    namespace.outputFallbacks = 0;
    try {
        const result = parse();
        return { result, fallbacks: namespace.outputFallbacks };
    } finally {
        namespace.outputFallbacks = outer;
    }
}
